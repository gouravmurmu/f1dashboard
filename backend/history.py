"""
Historical results from the Jolpica API (the maintained Ergast replacement), 1950 to today.

Everything is derived from full season results (races + sprints), so championship
progression, head-to-heads and season stats come from a handful of paginated requests.
"""
import logging
import time
from typing import Optional, Tuple

import numpy as np
import pandas as pd
import requests

from backend import demo

logger = logging.getLogger(__name__)

API = "https://api.jolpi.ca/ergast/f1"
PAGE = 100
TIMEOUT = 15


def _get_all(path: str, table: str, key: str) -> list:
    """Fetches every page of an endpoint. Returns the list under MRData[table][key]."""
    items, offset, total = [], 0, None
    session = requests.Session()
    while total is None or offset < total:
        for attempt in range(3):
            resp = session.get(f"{API}/{path}.json", params={"limit": PAGE, "offset": offset}, timeout=TIMEOUT)
            if resp.status_code == 429:  # rate limited, back off
                time.sleep(1.5 * (attempt + 1))
                continue
            resp.raise_for_status()
            break
        data = resp.json()["MRData"]
        total = int(data["total"])
        items.extend(data[table][key])
        offset += PAGE
    return items


def _flatten_results(races: list, sprint: bool) -> pd.DataFrame:
    rows = []
    field = "SprintResults" if sprint else "Results"
    for race in races:
        for r in race.get(field, []):
            d = r["Driver"]
            rows.append({
                "Season": int(race["season"]), "Round": int(race["round"]), "RaceName": race["raceName"],
                "Date": race["date"], "Circuit": race["Circuit"]["circuitName"],
                "Country": race["Circuit"]["Location"]["country"],
                "Driver": d.get("code") or d["familyName"][:3].upper(),
                "DriverName": f"{d['givenName']} {d['familyName']}", "DriverId": d["driverId"],
                "Constructor": r["Constructor"]["name"],
                "Grid": int(r["grid"]) if r.get("grid", "0") not in ("", None) else 0,
                "Position": int(r["position"]), "Points": float(r["points"]), "Status": r["status"],
                "Laps": int(r.get("laps", 0) or 0), "Sprint": sprint,
            })
    return pd.DataFrame(rows)


def season_results(year: int, source: str = "live") -> Tuple[pd.DataFrame, Optional[str]]:
    """All race (and sprint) results for a season."""
    if source == "live":
        try:
            races = _flatten_results(_get_all(f"{year}/results", "RaceTable", "Races"), sprint=False)
            try:
                sprints = _flatten_results(_get_all(f"{year}/sprint", "RaceTable", "Races"), sprint=True)
            except Exception:  # noqa: BLE001 - sprints only exist from 2021
                sprints = pd.DataFrame()
            if races.empty:
                return races, f"No results published for {year} yet."
            return pd.concat([races, sprints], ignore_index=True), None
        except Exception as e:  # noqa: BLE001
            logger.warning("Jolpica unavailable: %s", e)
            note = f"The results API is unreachable ({type(e).__name__}), so demo data is shown."
            return demo.demo_history(year), note
    return demo.demo_history(year), None


def champions(source: str = "live") -> Tuple[pd.DataFrame, Optional[str]]:
    """World Drivers' Champions for every season."""
    if source == "live":
        try:
            lists = _get_all("driverStandings/1", "StandingsTable", "StandingsLists")
            rows = []
            for s in lists:
                st = s["DriverStandings"][0]
                rows.append({"Season": int(s["season"]),
                             "Driver": f"{st['Driver']['givenName']} {st['Driver']['familyName']}",
                             "Constructor": st["Constructors"][0]["name"] if st["Constructors"] else "",
                             "Points": float(st["points"]), "Wins": int(st["wins"])})
            return pd.DataFrame(rows).sort_values("Season", ascending=False).reset_index(drop=True), None
        except Exception as e:  # noqa: BLE001
            logger.warning("Champions unavailable: %s", e)
            return demo.demo_champions(), "The results API is unreachable, so a partial list is shown."
    return demo.demo_champions(), None


# ---------- Derived tables (pure functions, easy to test) ----------
def championship_progression(results: pd.DataFrame, by: str = "Driver") -> pd.DataFrame:
    """Cumulative points after each round. Rows = rounds, columns = drivers/constructors."""
    key = "DriverName" if by == "Driver" else "Constructor"
    pts = results.groupby(["Round", key])["Points"].sum().unstack(fill_value=0).sort_index()
    return pts.cumsum()


def standings(results: pd.DataFrame, by: str = "Driver") -> pd.DataFrame:
    key = "DriverName" if by == "Driver" else "Constructor"
    races = results[~results["Sprint"]]
    table = pd.DataFrame({
        "Points": results.groupby(key)["Points"].sum(),
        "Wins": races[races["Position"] == 1].groupby(key).size(),
        "Podiums": races[races["Position"] <= 3].groupby(key).size(),
        "Poles": races[races["Grid"] == 1].groupby(key).size(),
        "DNFs": races[~races["Status"].str.contains("Finished|Lap", regex=True)].groupby(key).size(),
    }).fillna(0)
    if by == "Driver":
        table["Team"] = races.sort_values("Round").groupby(key)["Constructor"].last()
        table["Avg Finish"] = races.groupby(key)["Position"].mean().round(1)
        table["Avg Grid"] = races[races["Grid"] > 0].groupby(key)["Grid"].mean().round(1)
    table = table.sort_values(["Points", "Wins"], ascending=False)
    table.insert(0, "Pos", np.arange(1, len(table) + 1))
    for c in ("Wins", "Podiums", "Poles", "DNFs"):
        table[c] = table[c].astype(int)
    return table


def head_to_head(results: pd.DataFrame, a: str, b: str) -> pd.DataFrame:
    """Race-by-race comparison of two drivers (by full name) in the same season."""
    races = results[~results["Sprint"]]
    pa = races[races["DriverName"] == a].set_index("Round")
    pb = races[races["DriverName"] == b].set_index("Round")
    rounds = pa.index.intersection(pb.index)
    df = pd.DataFrame({
        "Race": pa.loc[rounds, "RaceName"],
        f"{a} grid": pa.loc[rounds, "Grid"], f"{b} grid": pb.loc[rounds, "Grid"],
        f"{a} finish": pa.loc[rounds, "Position"], f"{b} finish": pb.loc[rounds, "Position"],
        f"{a} pts": pa.loc[rounds, "Points"], f"{b} pts": pb.loc[rounds, "Points"],
    })
    return df


def position_changes(race: pd.DataFrame) -> pd.DataFrame:
    df = race[(race["Grid"] > 0)].copy()
    df["Gained"] = df["Grid"] - df["Position"]
    return df.sort_values("Position")
