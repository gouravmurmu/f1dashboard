"""Shared sidebar (season, race and data source) and cached data/model loaders."""
from datetime import datetime
from typing import Tuple

import pandas as pd
import streamlit as st

from backend import history, race_data
from backend.schema import RaceData
from models.pit_model import PitStopModel
from models.tyre_model import TyreModel, estimate_pit_loss

FIRST_SEASON_WITH_TIMING = 2018


@st.cache_data(show_spinner=False, ttl=3600)
def cached_schedule(year: int, source: str):
    return race_data.get_schedule(year, source)


@st.cache_data(show_spinner=False, ttl=24 * 3600, max_entries=12)
def cached_race(year: int, rnd: int, source: str) -> Tuple[RaceData, str]:
    return race_data.load_race(year, rnd, source)


@st.cache_data(show_spinner=False, ttl=24 * 3600, max_entries=16)
def cached_telemetry(year: int, rnd: int, driver: str, source: str) -> pd.DataFrame:
    return race_data.load_telemetry(year, rnd, driver, source)


@st.cache_data(show_spinner=False, ttl=6 * 3600)
def cached_season_results(year: int, source: str):
    return history.season_results(year, source)


@st.cache_data(show_spinner=False, ttl=24 * 3600)
def cached_champions(source: str):
    return history.champions(source)


@st.cache_resource(show_spinner=False, max_entries=12)
def tyre_model(year: int, rnd: int, source: str) -> TyreModel:
    race, _ = cached_race(year, rnd, source)
    return TyreModel.fit(race.laps)


@st.cache_resource(show_spinner=False, max_entries=12)
def pit_loss(year: int, rnd: int, source: str) -> float:
    race, _ = cached_race(year, rnd, source)
    return estimate_pit_loss(race.laps)


@st.cache_resource(show_spinner=False, max_entries=8)
def pit_model(year: int, rnd: int, source: str, extra_races: int = 2) -> Tuple[PitStopModel, list]:
    """Trained on this race plus up to `extra_races` earlier rounds of the same season."""
    rounds = [r for r in range(rnd, 0, -1)][: extra_races + 1]
    data, used = [], []
    for r in rounds:
        race, _ = cached_race(year, r, source)
        data.append((race.laps, race.total_laps))
        used.append(race.event_name if race.source != "demo" else f"Round {r}")
    return PitStopModel.fit(data), used


def data_source() -> str:
    """'live' or 'demo', chosen once in the sidebar and shared by every page."""
    if "source" not in st.session_state:
        st.session_state["source"] = "live"
    label = st.sidebar.radio("Data source", ["Live F1 data", "Demo data"], horizontal=True,
                             index=0 if st.session_state["source"] == "live" else 1,
                             help="Live uses FastF1 timing and the Jolpica results API. Demo data is simulated "
                                  "and works offline.")
    st.session_state["source"] = "live" if label.startswith("Live") else "demo"
    return st.session_state["source"]


def race_picker() -> Tuple[RaceData, str]:
    """Sidebar season/race selector. Returns the loaded race and the data source."""
    st.sidebar.markdown("### 🏁 Race")
    source = data_source()
    this_year = datetime.now().year
    years = list(range(this_year, FIRST_SEASON_WITH_TIMING - 1, -1))
    year = st.sidebar.selectbox("Season", years, index=years.index(st.session_state.get("year", years[0]))
                                if st.session_state.get("year") in years else 0)
    with st.spinner("Loading calendar..."):
        sched, note = cached_schedule(year, source)
    if sched.empty and year == this_year:
        st.sidebar.info(f"No {year} races completed yet, showing {year - 1}.")
        year -= 1
        sched, note = cached_schedule(year, source)
    if note:  # live timing is unreachable, so don't retry it for every race
        source = "demo"
    labels = [f"R{int(r.RoundNumber)} · {r.EventName}" for r in sched.itertuples()]
    default = st.session_state.get("round_label")
    idx = labels.index(default) if default in labels else len(labels) - 1
    choice = st.sidebar.selectbox("Grand Prix", labels, index=idx)
    rnd = int(sched.iloc[labels.index(choice)]["RoundNumber"])
    st.session_state.update(year=year, round_label=choice)

    with st.spinner(f"Loading {choice} (first load of a live race can take a minute)..."):
        race, race_note = cached_race(year, rnd, source)
    if race_note:  # make it unmistakable that this is not the real race
        race.event_name = f"{sched.iloc[labels.index(choice)]['EventName']} (simulated)"
    for msg in {note, race_note} - {None}:
        st.error(msg, icon="⚠️")
    if race.source == "demo":
        st.sidebar.caption("Showing simulated demo data, not real results.")
    elif race.source == "openf1":
        st.sidebar.caption("Timing from OpenF1.")
    return race, source
