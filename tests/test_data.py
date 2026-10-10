import numpy as np
import pandas as pd

from backend import history
from backend.race_data import normalise_laps, race_state
from backend.schema import LAP_COLUMNS


def test_demo_race_is_consistent(race):
    laps, res = race.laps, race.results
    assert list(laps.columns) == LAP_COLUMNS
    assert laps["LapNumber"].max() == race.total_laps
    assert res["Position"].tolist() == list(range(1, len(res) + 1))
    # Positions each lap are a permutation of 1..n running cars
    for _, g in laps.groupby("LapNumber"):
        assert sorted(g["Position"].astype(int)) == list(range(1, len(g) + 1))
    # Everyone who finished used at least two dry compounds
    finished = res.loc[res["Status"] == "Finished", "Driver"]
    used = laps.groupby("Driver")["Compound"].nunique()
    assert (used[finished] >= 2).all()


def test_normalise_fastf1_laps():
    td = pd.to_timedelta
    raw = pd.DataFrame({
        "Driver": ["AAA", "AAA", "BBB", "BBB"], "Team": ["T1", "T1", "T2", "T2"], "LapNumber": [1, 2, 1, 2],
        "LapTime": [td(95, "s"), td(90, "s"), pd.NaT, td(91, "s")],
        "Time": [td(3700, "s"), td(3790, "s"), td(3701, "s"), td(3792, "s")],
        "Position": [1, 1, 2, np.nan], "Compound": ["soft", "soft", "MEDIUM", "MEDIUM"],
        "TyreLife": [1, 2, 1, np.nan], "Stint": [1, 1, 1, 1],
        "PitInTime": [pd.NaT, pd.NaT, pd.NaT, td(3790, "s")], "PitOutTime": [pd.NaT] * 4,
        "TrackStatus": ["1", "14", "1", "1"],
    })
    out = normalise_laps(raw)
    assert list(out.columns) == LAP_COLUMNS
    assert out.loc[0, "Time"] == 95.0          # race-relative time
    assert out.loc[3, "Position"] == 2 and out.loc[3, "TyreLife"] == 2 and bool(out.loc[3, "PitIn"])
    assert out["Compound"].tolist()[:2] == ["SOFT", "SOFT"]


def test_race_state(race):
    st = race_state(race.laps, 20)
    assert st.iloc[0]["Gap"] == 0
    assert (st["Gap"].dropna().diff().dropna() >= -1e-9).all()
    assert {"Interval", "Stops", "Retired"} <= set(st.columns)


def test_history_derivations(season):
    prog = history.championship_progression(season)
    table = history.standings(season)
    assert prog.iloc[-1].max() == table["Points"].iloc[0]
    assert table["Pos"].tolist() == list(range(1, len(table) + 1))
    assert table["Wins"].sum() == season["Round"].nunique()
    a, b = table.index[:2]
    h = history.head_to_head(season, a, b)
    assert len(h) == season["Round"].nunique()
    con = history.standings(season, "Constructor")
    assert abs(con["Points"].sum() - table["Points"].sum()) < 1e-9
