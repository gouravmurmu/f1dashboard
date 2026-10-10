"""
Monte Carlo race simulator.

From the state at any lap it plays out the rest of the race thousands of times. Each
simulated lap uses the tyre model for pace, the pit model for stop decisions (with the
two-compound rule enforced), random safety cars that bunch the field, and lap-time noise
measured from the race itself. The output is a probability distribution of finishing
positions for every driver.
"""
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

from backend.race_data import race_state
from backend.schema import DRY_COMPOUNDS, RaceData
from models.pit_model import COMPOUND_CODE, MAX_STINT, PitStopModel
from models.tyre_model import TyreModel

POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]


@dataclass
class SimulationResult:
    drivers: list
    positions: np.ndarray        # (n_sims, n_drivers) finishing positions
    from_lap: int
    retired: list

    def summary(self) -> pd.DataFrame:
        p = self.positions
        pts = np.array(POINTS + [0] * 30)[p - 1]
        df = pd.DataFrame({
            "Driver": self.drivers,
            "Win %": (p == 1).mean(0) * 100,
            "Podium %": (p <= 3).mean(0) * 100,
            "Points %": (p <= 10).mean(0) * 100,
            "Exp. Pos": p.mean(0),
            "Best": p.min(0),
            "Worst": p.max(0),
            "Exp. Pts": pts.mean(0),
        })
        return df.sort_values("Exp. Pos").reset_index(drop=True)

    def distribution(self) -> pd.DataFrame:
        """Probability of each finishing position (rows = drivers, cols = positions)."""
        n = self.positions.shape[1]
        probs = np.stack([(self.positions == k).mean(0) for k in range(1, n + 1)], axis=1)
        return pd.DataFrame(probs, index=self.drivers, columns=range(1, n + 1))


class RaceSimulator:
    def __init__(self, race: RaceData, tyre: TyreModel, pit: Optional[PitStopModel] = None,
                 pit_loss: float = 21.5, sc_prob_per_lap: float = 0.012):
        self.race, self.tyre, self.pit = race, tyre, pit or PitStopModel()
        self.pit_loss, self.sc_prob = pit_loss, sc_prob_per_lap

    def run(self, from_lap: int, n_sims: int = 500, seed: int = 0) -> SimulationResult:
        rng = np.random.default_rng(seed)
        total = self.race.total_laps
        state = race_state(self.race.laps, from_lap)
        running = state[~state["Retired"]].reset_index(drop=True)
        retired = state[state["Retired"]]["Driver"].tolist()
        drivers = running["Driver"].tolist()
        S, D = n_sims, len(drivers)

        time = np.tile(running["Time"].values.astype(float), (S, 1))
        lap_done = np.tile(running["LapNumber"].values.astype(int), (S, 1))
        compound = np.tile(running["Compound"].values.astype(object), (S, 1))
        life = np.tile(running["TyreLife"].values.astype(float), (S, 1))
        stint = np.tile(running["Stint"].values.astype(float), (S, 1))
        used = self._compounds_used(from_lap, drivers)
        has_two = np.tile(np.array([len(used[d]) >= 2 for d in drivers]), (S, 1))
        # Wet races don't need two dry compounds
        if not set(self.race.laps["Compound"]).issubset(DRY_COMPOUNDS):
            has_two[:] = True
        sc_left = np.zeros(S, dtype=int)
        drv_arr = np.array(drivers, dtype=object)
        sigma = max(self.tyre.sigma, 0.2)
        max_life = np.vectorize(lambda c: MAX_STINT.get(c, 32))

        for _ in range(total - from_lap + 1):
            active = lap_done < total
            if not active.any():
                break
            lap_no = lap_done + 1
            remaining = total - lap_no

            # Safety car: starts randomly, lasts 3-5 laps, bunches the field
            start_sc = (sc_left == 0) & (rng.random(S) < self.sc_prob) & (remaining.max(1) > 3)
            sc_left[start_sc] = rng.integers(3, 6, start_sc.sum())
            if start_sc.any():
                for s in np.where(start_sc)[0]:
                    order = np.argsort(time[s])
                    time[s, order] = time[s, order[0]] + 0.8 * np.arange(D)
            under_sc = (sc_left > 0)[:, None]

            # Pit decisions
            feats = pd.DataFrame({
                "TyreLife": life.ravel(), "CompoundCode": pd.Series(compound.ravel()).map(COMPOUND_CODE).fillna(1),
                "Stint": stint.ravel(), "RaceProgress": (lap_no / total).ravel(),
                "LapsRemaining": remaining.ravel(),
                "PaceDrop": (self.tyre.tyre_cost(compound, life) - self.tyre.tyre_cost(compound, 1)).ravel(),
                "Neutralised": np.repeat(under_sc[:, 0], D).astype(int), "Position": _ranks(time).ravel(),
            })
            p = self.pit.predict_proba(feats).reshape(S, D)
            pit = rng.random((S, D)) < p
            pit |= life >= max_life(compound)                       # tyre is finished
            pit |= (~has_two) & (remaining <= rng.integers(2, 12, (S, D)))  # mandatory compound change
            pit &= active & (remaining >= 1)
            pit &= ~((remaining < 3) & has_two)

            # Lap time
            lt = self.tyre.predict(np.broadcast_to(drv_arr, (S, D)), compound, life, lap_no)
            lt = lt + rng.normal(0, sigma, (S, D))
            lt = np.where(under_sc, lt * 1.35, lt)
            lt = lt + pit * self.pit_loss * np.where(under_sc, 0.55, 1.0)
            time = np.where(active, time + lt, time)
            if under_sc.any():  # cars can't gain or lose much behind the safety car
                for s in np.where(under_sc[:, 0])[0]:
                    order = np.argsort(time[s])
                    time[s, order] = np.maximum(time[s, order], time[s, order[0]] + 0.8 * np.arange(D))

            # Tyre changes
            new_c = _choose_compound(compound, has_two, remaining)
            has_two = has_two | (pit & (new_c != compound))
            compound = np.where(pit, new_c, compound)
            life = np.where(pit, 1.0, np.where(active, life + 1, life))
            stint = stint + pit
            lap_done = np.where(active, lap_no, lap_done)
            sc_left = np.maximum(sc_left - 1, 0)

        # Classify: more laps first, then less time
        key = -lap_done * 1e6 + time
        positions = _ranks(key).astype(int)
        return SimulationResult(drivers, positions, from_lap, retired)

    def _compounds_used(self, lap: int, drivers: list) -> dict:
        laps = self.race.laps[self.race.laps["LapNumber"] <= lap]
        return {d: set(laps.loc[laps["Driver"] == d, "Compound"]) & set(DRY_COMPOUNDS) for d in drivers}


def _ranks(x: np.ndarray) -> np.ndarray:
    return np.argsort(np.argsort(x, axis=1), axis=1) + 1.0


def _choose_compound(current: np.ndarray, has_two: np.ndarray, remaining: np.ndarray) -> np.ndarray:
    preferred = np.where(remaining <= 18, "SOFT", np.where(remaining <= 30, "MEDIUM", "HARD")).astype(object)
    alt = np.where(remaining > 25, "HARD", "MEDIUM").astype(object)
    alt = np.where(alt == current, np.where(current == "HARD", "MEDIUM", "HARD"), alt)
    # If the rule is still unmet, never re-fit the same compound
    return np.where(~has_two & (preferred == current), alt, preferred)
