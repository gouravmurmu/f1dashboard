"""
Fuel-corrected tyre degradation model.

Lap time = driver pace + fuel effect x lap number
           + compound offset + linear wear x tyre age + quadratic wear x tyre age^2

Fitted jointly on clean green-flag laps (no pit in/out laps, no safety car, no outliers),
so each driver's raw pace is separated from the tyre and fuel effects.
"""
from dataclasses import dataclass, field
from typing import Dict

import numpy as np
import pandas as pd

from backend.schema import DRY_COMPOUNDS, is_neutralised

# Used when a compound was not raced (seconds relative to MEDIUM)
DEFAULT_COMPOUNDS = {"SOFT": (-0.65, 0.085, 0.0016), "MEDIUM": (0.0, 0.05, 0.0009), "HARD": (0.45, 0.03, 0.0004),
                     "INTERMEDIATE": (6.0, 0.06, 0.0), "WET": (10.0, 0.05, 0.0)}


def clean_laps(laps: pd.DataFrame) -> pd.DataFrame:
    df = laps[(laps["LapNumber"] > 1) & ~laps["PitIn"] & ~laps["PitOut"] & ~is_neutralised(laps["TrackStatus"])
              & laps["LapTime"].notna() & laps["Compound"].isin(DEFAULT_COMPOUNDS)].copy()
    med = df.groupby("Driver")["LapTime"].transform("median")
    return df[df["LapTime"] < med * 1.05]


@dataclass
class TyreModel:
    compounds: Dict[str, tuple] = field(default_factory=lambda: dict(DEFAULT_COMPOUNDS))
    driver_pace: Dict[str, float] = field(default_factory=dict)
    fuel_effect: float = -0.055
    base: float = 90.0
    sigma: float = 0.35
    metrics: Dict[str, float] = field(default_factory=dict)
    n_laps: int = 0

    # ---------- fitting ----------
    @classmethod
    def fit(cls, laps: pd.DataFrame, holdout: float = 0.2, seed: int = 0) -> "TyreModel":
        df = clean_laps(laps)
        model = cls()
        if len(df) < 50:
            if len(df):
                model.base = float(df["LapTime"].median())
            return model

        drivers = sorted(df["Driver"].unique())
        comps = [c for c in DEFAULT_COMPOUNDS if c in set(df["Compound"])]
        ref = "MEDIUM" if "MEDIUM" in comps else comps[0]

        def design(d: pd.DataFrame) -> np.ndarray:
            cols = [np.ones(len(d)), d["LapNumber"].values]
            cols += [(d["Driver"] == drv).values.astype(float) for drv in drivers[1:]]
            life = d["TyreLife"].values.astype(float)
            for c in comps:
                ind = (d["Compound"] == c).values.astype(float)
                if c != ref:
                    cols.append(ind)
                cols += [ind * life, ind * life ** 2]
            return np.column_stack(cols)

        rng = np.random.default_rng(seed)
        mask = rng.random(len(df)) >= holdout
        X, y = design(df), df["LapTime"].values
        coef = _ridge(X[mask], y[mask])
        pred = X[~mask] @ coef
        resid = y[~mask] - pred
        model.metrics = {
            "MAE (s)": float(np.mean(np.abs(resid))),
            "R²": float(1 - resid.var() / y[~mask].var()) if (~mask).sum() > 2 else np.nan,
            "Holdout laps": int((~mask).sum()),
        }
        coef = _ridge(X, y)  # refit on everything for use in the app
        model.sigma = float(np.std(y - X @ coef))
        model.n_laps = len(df)

        model.base, model.fuel_effect = float(coef[0]), float(coef[1])
        i = 2
        model.driver_pace = {drivers[0]: 0.0}
        for drv in drivers[1:]:
            model.driver_pace[drv] = float(coef[i])
            i += 1
        for c in comps:
            off = 0.0
            if c != ref:
                off = float(coef[i])
                i += 1
            lin, quad = float(coef[i]), float(coef[i + 1])
            i += 2
            model.compounds[c] = (off, max(lin, 0.0), quad)
        # Keep defaults for unseen compounds but express them relative to the fitted reference
        if ref != "MEDIUM":
            shift = DEFAULT_COMPOUNDS[ref][0]
            for c in DEFAULT_COMPOUNDS:
                if c not in comps:
                    o, lin, q = DEFAULT_COMPOUNDS[c]
                    model.compounds[c] = (o - shift, lin, q)
        return model

    # ---------- prediction ----------
    def compound_params(self, compound: str) -> tuple:
        return self.compounds.get(compound, self.compounds.get("MEDIUM", DEFAULT_COMPOUNDS["MEDIUM"]))

    def tyre_cost(self, compound, life):
        """Seconds added by the tyre (offset + wear) for scalar or array inputs."""
        compound, life = np.broadcast_arrays(np.asarray(compound), np.asarray(life, dtype=float))
        out = np.zeros(compound.shape)
        for c in np.unique(compound):
            off, lin, quad = self.compound_params(str(c))
            m = compound == c
            out[m] = off + lin * life[m] + quad * life[m] ** 2
        return out

    def predict(self, driver, compound, life, lap) -> np.ndarray:
        default = float(np.mean(list(self.driver_pace.values()))) if self.driver_pace else 0.0
        drv = np.vectorize(lambda d: self.driver_pace.get(d, default), otypes=[float])(np.asarray(driver))
        return self.base + drv + self.fuel_effect * np.asarray(lap, dtype=float) + self.tyre_cost(compound, life)

    def degradation_curve(self, compound: str, max_life: int = 40) -> pd.Series:
        """Time lost versus a fresh tyre of the same compound, by tyre age."""
        life = np.arange(1, max_life + 1)
        off, lin, quad = self.compound_params(compound)
        return pd.Series(lin * (life - 1) + quad * (life ** 2 - 1), index=life, name=compound)

    def deg_table(self) -> pd.DataFrame:
        rows = []
        for c in DRY_COMPOUNDS:
            off, lin, quad = self.compound_params(c)
            rows.append({"Compound": c, "Pace offset (s)": off, "Wear @ lap 10 (s/lap)": lin + 2 * quad * 10,
                         "Time lost after 20 laps (s)": lin * 19 + quad * (400 - 1)})
        return pd.DataFrame(rows).set_index("Compound")


def _ridge(X: np.ndarray, y: np.ndarray, alpha: float = 1e-3) -> np.ndarray:
    A = X.T @ X + alpha * np.eye(X.shape[1])
    A[0, 0] -= alpha  # don't shrink the intercept
    return np.linalg.solve(A, X.T @ y)


def estimate_pit_loss(laps: pd.DataFrame, default: float = 21.5) -> float:
    """Median time lost to a green-flag stop (in-lap + out-lap minus two normal laps)."""
    df = laps.sort_values(["Driver", "LapNumber"]).copy()
    med = clean_laps(laps).groupby("Driver")["LapTime"].median()
    losses = []
    for drv, g in df.groupby("Driver"):
        g = g.set_index("LapNumber")
        for lap in g.index[g["PitIn"]]:
            if lap + 1 in g.index and drv in med and not is_neutralised(g.loc[[lap, lap + 1], "TrackStatus"]).any():
                losses.append(g.loc[lap, "LapTime"] + g.loc[lap + 1, "LapTime"] - 2 * med[drv])
    losses = [x for x in losses if 10 < x < 45]
    return float(np.median(losses)) if losses else default
