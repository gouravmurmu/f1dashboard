"""Race loading through FastF1, normalised to backend.schema, with a demo fallback."""
import logging
import os
from datetime import datetime, timezone
from typing import Optional, Tuple

import numpy as np
import pandas as pd

from backend import demo
from backend.schema import LAP_COLUMNS, RaceData

logger = logging.getLogger(__name__)

CACHE_DIR = os.environ.get("F1_CACHE_DIR", os.path.join(os.path.dirname(__file__), "..", ".fastf1-cache"))
POINTS = demo.POINTS


def _fastf1():
    import fastf1
    os.makedirs(CACHE_DIR, exist_ok=True)
    fastf1.Cache.enable_cache(CACHE_DIR)
    return fastf1


def get_schedule(year: int, source: str = "live") -> Tuple[pd.DataFrame, Optional[str]]:
    """Completed race rounds for a season. Returns (schedule, fallback note)."""
    if source == "live":
        try:
            ff1 = _fastf1()
            sched = ff1.get_event_schedule(year, include_testing=False)
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            date_col = "Session5DateUtc" if "Session5DateUtc" in sched else "EventDate"
            done = sched[pd.to_datetime(sched[date_col]) + pd.Timedelta(hours=3) < now]
            if not done.empty:
                return done[["RoundNumber", "EventName", "Location", "EventDate"]].reset_index(drop=True), None
            return pd.DataFrame(columns=["RoundNumber", "EventName", "Location", "EventDate"]), None
        except Exception as e:  # noqa: BLE001
            logger.warning("Schedule for %s unavailable: %s", year, e)
            note = f"F1 timing data is unreachable ({type(e).__name__}), so demo data is shown."
            return demo.demo_schedule(year), note
    return demo.demo_schedule(year), None


def load_race(year: int, round_number: int, source: str = "live") -> Tuple[RaceData, Optional[str]]:
    """Loads a race. Falls back to a generated race if live data is unavailable."""
    if source == "live":
        try:
            return _load_fastf1_race(year, round_number), None
        except Exception as e:  # noqa: BLE001
            logger.warning("Live race load failed: %s", e)
            note = f"Could not load live timing for this race ({type(e).__name__}), so a simulated race is shown."
            return demo.generate_race(year, round_number), note
    return demo.generate_race(year, round_number), None


def _load_fastf1_race(year: int, round_number: int) -> RaceData:
    ff1 = _fastf1()
    session = ff1.get_session(year, round_number, "R")
    session.load(laps=True, telemetry=False, weather=True, messages=False)
    laps = normalise_laps(session.laps)
    if laps.empty:
        raise ValueError("no lap data")

    r = session.results.copy()
    results = pd.DataFrame({
        "Position": pd.to_numeric(r["Position"], errors="coerce"),
        "Driver": r["Abbreviation"].values,
        "FullName": r["FullName"].values,
        "Team": r["TeamName"].values,
        "TeamColor": ["#" + c if isinstance(c, str) and c and not c.startswith("#") else (c or "#888888")
                      for c in r["TeamColor"].fillna("888888")],
        "Grid": pd.to_numeric(r["GridPosition"], errors="coerce").values,
        "Status": r["Status"].values,
        "Points": pd.to_numeric(r["Points"], errors="coerce").fillna(0).values,
    })
    last_lap = laps.groupby("Driver")["LapNumber"].max()
    results["LapsCompleted"] = results["Driver"].map(last_lap).fillna(0).astype(int)
    results["Position"] = results["Position"].fillna(results["Position"].max() + 1).astype(int)
    results = results.sort_values("Position").reset_index(drop=True)
    total_laps = int(laps["LapNumber"].max())
    finish = laps[laps["LapNumber"] == laps.groupby("Driver")["LapNumber"].transform("max")].set_index("Driver")["Time"]
    winner_time = finish.get(results.loc[0, "Driver"], np.nan)
    gaps = []
    for k, row in results.iterrows():
        if k == 0:
            gaps.append("Winner")
        elif row["LapsCompleted"] == total_laps and row["Driver"] in finish:
            gaps.append(f"+{finish[row['Driver']] - winner_time:.3f}s")
        elif str(row["Status"]).startswith("+") or row["Status"] in ("Lapped", "Finished"):
            down = total_laps - row["LapsCompleted"]
            gaps.append(f"+{down} lap{'s' if down > 1 else ''}")
        else:
            gaps.append(str(row["Status"]))
    results["Gap"] = gaps

    w = session.weather_data
    weather = {} if w is None or w.empty else {
        "AirTemp": float(w["AirTemp"].mean()), "TrackTemp": float(w["TrackTemp"].mean()),
        "Humidity": float(w["Humidity"].mean()), "Rainfall": bool(w["Rainfall"].any()),
    }
    ev = session.event
    return RaceData(year=year, round=round_number, event_name=ev["EventName"], location=ev["Location"],
                    date=pd.Timestamp(ev["EventDate"]), total_laps=total_laps, laps=laps, results=results,
                    weather=weather, source="fastf1")


def normalise_laps(raw: pd.DataFrame) -> pd.DataFrame:
    """Converts FastF1 Laps into the app's schema (seconds, booleans, race-relative time)."""
    if raw is None or len(raw) == 0:
        return pd.DataFrame(columns=LAP_COLUMNS)
    df = pd.DataFrame({
        "Driver": raw["Driver"].values,
        "Team": raw["Team"].values,
        "LapNumber": pd.to_numeric(raw["LapNumber"], errors="coerce").values,
        "LapTime": raw["LapTime"].dt.total_seconds().values,
        "Time": raw["Time"].dt.total_seconds().values,
        "Position": pd.to_numeric(raw["Position"], errors="coerce").values,
        "Compound": raw["Compound"].fillna("UNKNOWN").astype(str).str.upper().values,
        "TyreLife": pd.to_numeric(raw["TyreLife"], errors="coerce").values,
        "Stint": pd.to_numeric(raw["Stint"], errors="coerce").values,
        "PitIn": raw["PitInTime"].notna().values,
        "PitOut": raw["PitOutTime"].notna().values,
        "TrackStatus": raw["TrackStatus"].fillna("1").astype(str).values,
    }).dropna(subset=["LapNumber", "Time"])
    df["LapNumber"] = df["LapNumber"].astype(int)
    # Race-relative time: zero at the start (first lap's end minus its lap time)
    start = (df.loc[df["LapNumber"] == 1, "Time"] - df.loc[df["LapNumber"] == 1, "LapTime"]).min()
    if pd.notna(start):
        df["Time"] = df["Time"] - start
    # Fill missing lap times from consecutive race times
    df = df.sort_values(["Driver", "LapNumber"])
    df["LapTime"] = df["LapTime"].fillna(df.groupby("Driver")["Time"].diff())
    df["TyreLife"] = df["TyreLife"].fillna(df.groupby(["Driver", "Stint"]).cumcount() + 1)
    df["Stint"] = df["Stint"].ffill().fillna(1).astype(int)
    # Recompute positions from race time where FastF1 has gaps
    df["Position"] = df["Position"].fillna(df.groupby("LapNumber")["Time"].rank(method="first"))
    return df.reset_index(drop=True)[LAP_COLUMNS]


def load_telemetry(year: int, round_number: int, driver: str, source: str = "live") -> pd.DataFrame:
    """Fastest-lap car telemetry with distance and track position."""
    if source == "live":
        try:
            ff1 = _fastf1()
            session = ff1.get_session(year, round_number, "R")
            session.load(laps=True, telemetry=True, weather=False, messages=False)
            lap = session.laps.pick_drivers(driver).pick_fastest()
            tel = lap.get_telemetry()
            tel = tel[["Distance", "Speed", "Throttle", "Brake", "nGear", "X", "Y", "Time"]].copy()
            tel["Time"] = tel["Time"].dt.total_seconds()
            tel["Brake"] = tel["Brake"].astype(bool)
            return tel.reset_index(drop=True)
        except Exception as e:  # noqa: BLE001
            logger.warning("Telemetry unavailable for %s: %s", driver, e)
    return demo.generate_telemetry(driver, seed=year * 100 + round_number)


def race_state(laps: pd.DataFrame, lap: int) -> pd.DataFrame:
    """Classification at the end of `lap`: gap, interval, tyre, stops, last lap."""
    upto = laps[laps["LapNumber"] <= lap]
    if upto.empty:
        return pd.DataFrame()
    last = upto.sort_values("LapNumber").groupby("Driver").tail(1).copy()
    # Drivers who are a lap (or more) down are classified after those on the lead lap
    last = last.sort_values(["LapNumber", "Time"], ascending=[False, True]).reset_index(drop=True)
    last["Pos"] = np.arange(1, len(last) + 1)
    leader_lap = last["LapNumber"].max()
    leader_times = laps[laps["Driver"] == last.loc[0, "Driver"]].set_index("LapNumber")["Time"]
    gaps = []
    for k, row in last.iterrows():
        if row["LapNumber"] < leader_lap - 1 and row["LapNumber"] < lap:
            gaps.append(np.nan)
        else:
            gaps.append(row["Time"] - leader_times.get(row["LapNumber"], np.nan))
    last["Gap"] = gaps
    last["Interval"] = last["Gap"].diff()
    stops = upto.groupby("Driver")["PitIn"].sum()
    last["Stops"] = last["Driver"].map(stops).astype(int)
    final_lap = laps.groupby("Driver")["LapNumber"].max()
    race_max = laps["LapNumber"].max()
    last["Retired"] = last["Driver"].map(final_lap).lt(min(lap, race_max - 2)).values
    return last
