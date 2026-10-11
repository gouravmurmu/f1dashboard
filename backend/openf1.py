"""Race loader for the OpenF1 API (https://openf1.org), used when FastF1 timing can't be loaded.

OpenF1 covers 2023 onwards, needs no key for historical sessions and is light enough to load in a few
seconds, so it is the second live source before the app falls back to simulated data.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

import numpy as np
import pandas as pd
import requests

from backend.schema import LAP_COLUMNS, RaceData

BASE = "https://api.openf1.org/v1"
logger = logging.getLogger(__name__)
_session = requests.Session()
_session.headers["User-Agent"] = "f1dashboard (github.com/gouravmurmu/f1dashboard)"


def get(endpoint: str, **params) -> pd.DataFrame:
    """GET an OpenF1 endpoint as a DataFrame, retrying politely on rate limits."""
    for attempt in range(4):
        resp = _session.get(f"{BASE}/{endpoint}", params=params, timeout=30)
        if resp.status_code == 429:
            time.sleep(1.5 * (attempt + 1))
            continue
        if resp.status_code == 404:  # OpenF1 answers 404 when a filter matches nothing
            return pd.DataFrame()
        resp.raise_for_status()
        time.sleep(0.35)  # stay under the free tier's requests-per-second limit
        return pd.DataFrame(resp.json())
    raise RuntimeError(f"OpenF1 rate limit on {endpoint}")


def schedule(year: int) -> pd.DataFrame:
    """Completed, non-cancelled Grands Prix in the same shape as the FastF1 schedule."""
    sessions = get("sessions", year=year, session_name="Race")
    meetings = get("meetings", year=year)
    if sessions.empty:
        raise LookupError(f"OpenF1 has no races for {year}")
    if "is_cancelled" in sessions:
        sessions = sessions[~sessions["is_cancelled"].fillna(False).astype(bool)]
    sessions = sessions.assign(end=pd.to_datetime(sessions["date_end"], utc=True, format="ISO8601"),
                               start=pd.to_datetime(sessions["date_start"], utc=True, format="ISO8601"))
    sessions = sessions.sort_values("start").reset_index(drop=True)
    sessions["RoundNumber"] = range(1, len(sessions) + 1)
    names = meetings.set_index("meeting_key")["meeting_name"].to_dict() if not meetings.empty else {}
    done = sessions[sessions["end"] + pd.Timedelta(hours=1) < pd.Timestamp.now(tz="UTC")]
    return pd.DataFrame({
        "RoundNumber": done["RoundNumber"].values,
        "EventName": [names.get(k, f"{loc} Grand Prix") for k, loc in zip(done["meeting_key"], done["location"])],
        "Location": done["location"].values,
        "EventDate": done["start"].dt.tz_localize(None).dt.normalize().values,
    })


def find_race_session(year: int, race_date) -> Optional[int]:
    """session_key of the Grand Prix (not sprint) held within a day of ``race_date``."""
    sessions = get("sessions", year=year, session_name="Race")
    if sessions.empty:
        return None
    if "is_cancelled" in sessions:
        sessions = sessions[~sessions["is_cancelled"].fillna(False).astype(bool)]
    starts = pd.to_datetime(sessions["date_start"], utc=True).dt.tz_localize(None).dt.normalize()
    target = pd.Timestamp(race_date).tz_localize(None).normalize()
    match = sessions[(starts - target).abs() <= pd.Timedelta(days=1)]
    return int(match.iloc[0]["session_key"]) if not match.empty else None


def _status_intervals(rc: pd.DataFrame) -> list:
    """(start, end, FastF1-style track status code) for safety cars, VSCs and red flags."""
    if rc.empty or "message" not in rc:
        return []
    rc = rc.assign(date=pd.to_datetime(rc["date"], utc=True)).sort_values("date")
    out, open_ = [], {}
    for row in rc.itertuples():
        msg = str(row.message).upper()
        flag = str(getattr(row, "flag", "") or "").upper()
        if "VIRTUAL SAFETY CAR DEPLOYED" in msg:
            open_["6"] = row.date
        elif "VIRTUAL SAFETY CAR ENDING" in msg and "6" in open_:
            out.append((open_.pop("6"), row.date, "6"))
        elif "SAFETY CAR DEPLOYED" in msg:
            open_["4"] = row.date
        elif "SAFETY CAR IN THIS LAP" in msg and "4" in open_:
            out.append((open_.pop("4"), row.date + pd.Timedelta(seconds=90), "4"))
        elif flag == "RED" or "RED FLAG" in msg:
            open_.setdefault("5", row.date)
        elif "5" in open_ and ("RESUME" in msg or flag == "GREEN"):
            out.append((open_.pop("5"), row.date, "5"))
    end = rc["date"].max() if not rc.empty else None
    out += [(start, end, code) for code, start in open_.items()]
    return out


def load_race(year: int, round_number: int, race_date, event_name: str, location: str) -> RaceData:
    key = find_race_session(year, race_date)
    if key is None:
        raise LookupError(f"OpenF1 has no race session on {pd.Timestamp(race_date).date()}")
    drivers = get("drivers", session_key=key).drop_duplicates("driver_number")
    laps = get("laps", session_key=key)
    if laps.empty or drivers.empty:
        raise ValueError("OpenF1 returned no laps for this race")
    stints = get("stints", session_key=key)
    pits = get("pit", session_key=key)
    pos = get("position", session_key=key)
    rc = get("race_control", session_key=key)
    result = get("session_result", session_key=key)
    grid = get("starting_grid", session_key=key)
    weather = get("weather", session_key=key)

    drv = drivers.set_index("driver_number")
    abbr = drv["name_acronym"].to_dict()
    team = drv["team_name"].to_dict()

    laps = laps.assign(start=pd.to_datetime(laps["date_start"], utc=True, format="ISO8601"))
    laps = laps.dropna(subset=["start"]).sort_values(["driver_number", "lap_number"])
    nxt = laps.groupby("driver_number")["start"].shift(-1)
    dur = laps["lap_duration"].astype(float).fillna((nxt - laps["start"]).dt.total_seconds())
    laps = laps.assign(dur=dur, end=laps["start"] + pd.to_timedelta(dur, unit="s")).dropna(subset=["end"])
    race_start = laps.loc[laps["lap_number"] == 1, "start"].min()

    # Position at the end of each lap: the latest position message at or before the lap ends.
    if not pos.empty:
        pos = pos.assign(date=pd.to_datetime(pos["date"], utc=True, format="ISO8601")).sort_values("date")
        laps = pd.merge_asof(laps.sort_values("end"), pos[["date", "driver_number", "position"]],
                             left_on="end", right_on="date", by="driver_number", direction="backward")
    else:
        laps["position"] = np.nan

    # Tyres from stints.
    comp = np.full(len(laps), "UNKNOWN", dtype=object)
    life = np.full(len(laps), np.nan)
    stint_no = np.ones(len(laps))
    laps = laps.reset_index(drop=True)
    for s in stints.itertuples() if not stints.empty else []:
        m = (laps["driver_number"] == s.driver_number) & laps["lap_number"].between(s.lap_start, s.lap_end or 999)
        comp[m] = str(s.compound or "UNKNOWN").upper()
        life[m] = (s.tyre_age_at_start or 0) + laps.loc[m, "lap_number"] - s.lap_start + 1
        stint_no[m] = s.stint_number
    pit_laps = set(zip(pits["driver_number"], pits["lap_number"])) if not pits.empty else set()

    intervals = _status_intervals(rc)

    def status(row) -> str:
        codes = {c for a, b, c in intervals if a <= row.end and b >= row.start}
        return "1" + "".join(sorted(codes))

    out = pd.DataFrame({
        "Driver": laps["driver_number"].map(abbr).values,
        "Team": laps["driver_number"].map(team).values,
        "LapNumber": laps["lap_number"].astype(int).values,
        "LapTime": laps["dur"].values,
        "Time": (laps["end"] - race_start).dt.total_seconds().values,
        "Position": laps["position"].values,
        "Compound": comp,
        "TyreLife": life,
        "Stint": stint_no.astype(int),
        "PitIn": [(d, n) in pit_laps for d, n in zip(laps["driver_number"], laps["lap_number"])],
        "PitOut": laps.get("is_pit_out_lap", pd.Series(False, index=laps.index)).fillna(False).astype(bool).values,
        "TrackStatus": [status(r) for r in laps.itertuples()],
    }).dropna(subset=["Driver"]).sort_values(["Driver", "LapNumber"]).reset_index(drop=True)
    out["Position"] = out["Position"].fillna(out.groupby("LapNumber")["Time"].rank(method="first"))
    out["TyreLife"] = out["TyreLife"].fillna(out.groupby(["Driver", "Stint"]).cumcount() + 1)

    total_laps = int(out["LapNumber"].max())
    last_lap = out.groupby("Driver")["LapNumber"].max()
    if not result.empty:
        res = result.set_index("driver_number")
        order = res["position"].astype(float).fillna(99).sort_values()
        numbers = list(order.index) + [n for n in drv.index if n not in order.index]
    else:
        numbers = list(out.groupby("Driver")["Time"].max().sort_values().index.map(
            {v: k for k, v in abbr.items()}))
        res = pd.DataFrame(index=numbers)
    grid_pos = grid.set_index("driver_number")["position"].to_dict() if not grid.empty else {}
    first_lap_pos = out[out["LapNumber"] == 1].set_index("Driver")["Position"].to_dict()

    rows = []
    for i, n in enumerate(numbers, start=1):
        r = res.loc[n] if n in res.index else pd.Series(dtype=object)
        code = abbr.get(n, str(n))
        if bool(r.get("dsq", False)):
            st = "Disqualified"
        elif bool(r.get("dns", False)):
            st = "Did not start"
        elif bool(r.get("dnf", False)):
            st = "Retired"
        else:
            st = "Finished"
        gap = r.get("gap_to_leader")
        if i == 1:
            gap_s = "Winner"
        elif isinstance(gap, (int, float)) and not pd.isna(gap):
            gap_s = f"+{gap:.3f}s"
        elif isinstance(gap, str) and gap:
            gap_s = gap if gap.startswith("+") else f"+{gap}"
        else:
            gap_s = st
        rows.append({
            "Position": i, "Driver": code, "FullName": drv["full_name"].get(n, code) if "full_name" in drv else code,
            "Team": team.get(n, ""),
            "TeamColor": "#" + str(drv["team_colour"].get(n, "888888") or "888888").lstrip("#"),
            "Grid": int(grid_pos.get(n, first_lap_pos.get(code, 0)) or 0), "Status": st,
            "Points": float(r.get("points", 0) or 0), "Gap": gap_s, "LapsCompleted": int(last_lap.get(code, 0)),
        })
    results = pd.DataFrame(rows)

    wx = {}
    if not weather.empty:
        wx = {"AirTemp": float(weather["air_temperature"].mean()),
              "TrackTemp": float(weather["track_temperature"].mean()),
              "Humidity": float(weather["humidity"].mean()), "Rainfall": bool(weather["rainfall"].astype(float).any())}
    return RaceData(year=year, round=round_number, event_name=event_name, location=location,
                    date=pd.Timestamp(race_date), total_laps=total_laps, laps=out[LAP_COLUMNS], results=results,
                    weather=wx, source="openf1")
