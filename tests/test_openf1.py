import pandas as pd
import pytest

from backend import openf1

KEY = 11731
T0 = pd.Timestamp("2026-10-04T08:00:00Z")


def _iso(seconds):
    return (T0 + pd.Timedelta(seconds=seconds)).isoformat()


@pytest.fixture
def fake_api(monkeypatch):
    laps, pos = [], []
    for n, (num, pace) in enumerate([(12, 90.0), (63, 90.4), (44, 91.0)]):
        for lap in range(1, 11):
            start = (lap - 1) * pace + n * 0.5
            laps.append({"driver_number": num, "lap_number": lap, "date_start": _iso(start),
                         "lap_duration": None if lap == 1 else pace, "is_pit_out_lap": lap == 6 and num == 44})
        pos.append({"driver_number": num, "position": n + 1, "date": _iso(1)})
    pos.append({"driver_number": 44, "position": 2, "date": _iso(300)})
    pos.append({"driver_number": 63, "position": 3, "date": _iso(300)})
    tables = {
        "sessions": [{"session_key": KEY, "meeting_key": 1308, "date_start": "2026-10-04T07:00:00+00:00",
                      "date_end": "2026-10-04T09:00:00+00:00", "location": "Kuala Lumpur", "is_cancelled": False},
                     {"session_key": 11261, "meeting_key": 1282, "date_start": "2026-04-12T15:00:00+00:00",
                      "date_end": "2026-04-12T17:00:00+00:00", "location": "Sakhir", "is_cancelled": True}],
        "meetings": [{"meeting_key": 1308, "meeting_name": "Bahrain Grand Prix"}],
        "drivers": [{"driver_number": 12, "name_acronym": "ANT", "full_name": "Kimi ANTONELLI",
                     "team_name": "Mercedes", "team_colour": "00D7B6"},
                    {"driver_number": 63, "name_acronym": "RUS", "full_name": "George RUSSELL",
                     "team_name": "Mercedes", "team_colour": "00D7B6"},
                    {"driver_number": 44, "name_acronym": "HAM", "full_name": "Lewis HAMILTON",
                     "team_name": "Ferrari", "team_colour": "ED1131"}],
        "laps": laps,
        "stints": [{"driver_number": d, "stint_number": 1, "lap_start": 1, "lap_end": 5, "compound": "MEDIUM",
                    "tyre_age_at_start": 0} for d in (12, 63, 44)]
        + [{"driver_number": d, "stint_number": 2, "lap_start": 6, "lap_end": 10, "compound": "HARD",
            "tyre_age_at_start": 0} for d in (12, 63, 44)],
        "pit": [{"driver_number": 44, "lap_number": 5, "date": _iso(450)}],
        "position": pos,
        "race_control": [{"date": _iso(200), "message": "SAFETY CAR DEPLOYED", "flag": None},
                         {"date": _iso(330), "message": "SAFETY CAR IN THIS LAP", "flag": None}],
        "session_result": [{"driver_number": 12, "position": 1, "points": 25, "gap_to_leader": 0},
                           {"driver_number": 44, "position": 2, "points": 18, "gap_to_leader": 9.876},
                           {"driver_number": 63, "position": 3, "points": 15, "gap_to_leader": "+1 LAP"}],
        "starting_grid": [{"driver_number": 63, "position": 1}, {"driver_number": 12, "position": 2},
                          {"driver_number": 44, "position": 3}],
        "weather": [{"air_temperature": 31.0, "track_temperature": 44.0, "humidity": 70, "rainfall": 0}],
    }

    def get(endpoint, **params):
        return pd.DataFrame(tables.get(endpoint, []))

    monkeypatch.setattr(openf1, "get", get)


def test_schedule_skips_cancelled_races(fake_api):
    s = openf1.schedule(2026)
    assert list(s["EventName"]) == ["Bahrain Grand Prix"]
    assert s["RoundNumber"].tolist() == [1]


def test_load_race_normalises_laps_results_and_status(fake_api):
    race = openf1.load_race(2026, 16, pd.Timestamp("2026-10-04"), "Bahrain Grand Prix", "Kuala Lumpur")
    laps, res = race.laps, race.results
    assert race.source == "openf1" and race.total_laps == 10
    assert set(laps["Driver"]) == {"ANT", "RUS", "HAM"}
    assert laps["LapTime"].notna().all()  # lap 1 duration filled from the next lap start
    assert laps.loc[(laps["Driver"] == "HAM") & (laps["LapNumber"] == 6), "Compound"].item() == "HARD"
    assert laps.loc[(laps["Driver"] == "HAM") & (laps["LapNumber"] == 5), "PitIn"].item()
    assert laps["TrackStatus"].str.contains("4").any()
    assert res["Driver"].tolist() == ["ANT", "HAM", "RUS"]
    assert res.loc[1, "Gap"] == "+9.876s" and res.loc[2, "Gap"] == "+1 LAP"
    assert res.loc[0, "Grid"] == 2 and res.loc[0, "TeamColor"] == "#00D7B6"
    late = laps[(laps["Driver"] == "HAM") & (laps["LapNumber"] == 8)]
    assert late["Position"].item() == 2


def test_race_data_falls_back_to_openf1(monkeypatch, fake_api):
    from backend import race_data

    def boom(*a, **k):
        raise ConnectionError("livetiming down")

    monkeypatch.setattr(race_data, "_load_fastf1_race", boom)
    monkeypatch.setattr(race_data, "get_schedule", lambda y, s: (openf1.schedule(y), None))
    race, note = race_data.load_race(2026, 1, "live")
    assert note is None and race.source == "openf1"
