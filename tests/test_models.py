import numpy as np

from backend import demo
from models.pit_model import PitStopModel, build_features
from models.simulator import RaceSimulator
from models.strategy import optimise
from models.tyre_model import TyreModel, estimate_pit_loss


def test_tyre_model_recovers_compound_ordering(race):
    tm = TyreModel.fit(race.laps)
    soft, med, hard = (tm.compound_params(c) for c in ("SOFT", "MEDIUM", "HARD"))
    assert soft[0] < med[0] < hard[0]          # softs are faster when new
    assert soft[1] > med[1] > hard[1]          # ...and wear faster
    assert abs(tm.fuel_effect - demo.FUEL_EFFECT) < 0.02
    assert tm.metrics["R²"] > 0.6 and tm.metrics["MAE (s)"] < 0.5


def test_pit_loss_estimate(race):
    assert abs(estimate_pit_loss(race.laps) - demo.PIT_LOSS) < 4


def test_pit_model_beats_baseline_without_leakage():
    races = [(r.laps, r.total_laps) for r in (demo.generate_race(2024, k) for k in range(1, 5))]
    pm = PitStopModel.fit(races)
    assert pm.trained
    assert pm.metrics["ROC AUC"] > pm.metrics["Baseline ROC AUC"]
    assert pm.metrics["ROC AUC"] < 0.995, "suspiciously perfect: check for target leakage"
    f = build_features(*races[0])
    p = pm.predict_proba(f)
    assert ((p >= 0) & (p <= 1)).all()


def test_simulator_probabilities(race):
    tm = TyreModel.fit(race.laps)
    sim = RaceSimulator(race, tm, None, 21.5)
    res = sim.run(from_lap=30, n_sims=200, seed=1)
    s = res.summary()
    n = len(res.drivers)
    assert abs(s["Win %"].sum() - 100) < 1e-6
    assert abs(s["Podium %"].sum() - 300) < 1e-6
    dist = res.distribution()
    assert np.allclose(dist.sum(axis=1), 1) and np.allclose(dist.sum(axis=0), 1)
    assert res.positions.shape == (200, n)
    # Late in the race the current leader should be a strong favourite
    late = sim.run(from_lap=race.total_laps - 2, n_sims=200).summary()
    leader = race.laps[race.laps["LapNumber"] == race.total_laps - 2].sort_values("Time").iloc[0]["Driver"]
    assert late.set_index("Driver").loc[leader, "Win %"] > 70


def test_strategy_optimiser(race):
    plans = optimise(TyreModel.fit(race.laps), race.total_laps, 21.5)
    assert not plans.empty and plans["Delta (s)"].iloc[0] == 0
    for stints in plans["Stints"]:
        assert sum(n for _, n in stints) == race.total_laps
        assert len({c for c, _ in stints}) >= 2
