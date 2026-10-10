"""
Pit stop prediction: probability that a driver pits at the end of the current lap.

A gradient-boosted tree model trained on lap-level features. It is evaluated with
grouped cross-validation (each fold holds out whole drivers, so the model never sees
the car it is scored on) and compared with a tyre-age-only logistic baseline.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import GroupKFold

from backend.schema import is_neutralised

FEATURES = ["TyreLife", "CompoundCode", "Stint", "RaceProgress", "LapsRemaining", "PaceDrop", "Neutralised",
            "Position"]
COMPOUND_CODE = {"SOFT": 0, "MEDIUM": 1, "HARD": 2, "INTERMEDIATE": 3, "WET": 4}
MAX_STINT = {"SOFT": 24, "MEDIUM": 34, "HARD": 46, "INTERMEDIATE": 30, "WET": 30}


def build_features(laps: pd.DataFrame, total_laps: int) -> pd.DataFrame:
    df = laps.sort_values(["Driver", "LapNumber"]).copy()
    df["CompoundCode"] = df["Compound"].map(COMPOUND_CODE).fillna(1)
    df["RaceProgress"] = df["LapNumber"] / total_laps
    df["LapsRemaining"] = total_laps - df["LapNumber"]
    df["Neutralised"] = is_neutralised(df["TrackStatus"]).astype(int)
    clean = df["LapTime"].where(~df["PitOut"] & ~df["PitIn"] & (df["Neutralised"] == 0))
    # Only information from laps already completed in this stint, so the in-lap itself
    # (slow because of the pit entry) can't leak into its own prediction.
    keys = [df["Driver"], df["Stint"]]
    prior = clean.groupby(keys).shift(1)
    stint_best = prior.groupby(keys).cummin()
    recent = prior.groupby(keys).transform(lambda s: s.rolling(3, min_periods=1).mean())
    drop = (recent - stint_best).clip(lower=0)
    df["PaceDrop"] = drop.groupby(keys).ffill().fillna(0)
    df["Position"] = df["Position"].fillna(10)
    return df


@dataclass
class PitStopModel:
    model: Optional[HistGradientBoostingClassifier] = None
    metrics: Dict[str, float] = field(default_factory=dict)
    importance: pd.Series = field(default_factory=pd.Series)
    n_samples: int = 0
    n_stops: int = 0

    @classmethod
    def fit(cls, races: List[tuple]) -> "PitStopModel":
        """`races` is a list of (laps, total_laps) pairs. More races give a better model."""
        frames = []
        for k, (laps, total) in enumerate(races):
            f = build_features(laps, total)
            f = f[f["LapNumber"] < total]  # nobody pits on the last lap
            f["Group"] = f["Driver"] + f"_{k}"
            frames.append(f)
        df = pd.concat(frames, ignore_index=True)
        X, y, groups = df[FEATURES].values, df["PitIn"].astype(int).values, df["Group"].values
        out = cls(n_samples=len(df), n_stops=int(y.sum()))
        if y.sum() < 8 or len(np.unique(groups)) < 5:
            return out

        def gbm():
            return HistGradientBoostingClassifier(max_depth=3, learning_rate=0.06, max_iter=250,
                                                  min_samples_leaf=15, l2_regularization=1.0, random_state=0)

        oof = np.zeros(len(y))
        oof_base = np.zeros(len(y))
        for tr, te in GroupKFold(n_splits=5).split(X, y, groups):
            if y[tr].sum() == 0:
                continue
            oof[te] = gbm().fit(X[tr], y[tr]).predict_proba(X[te])[:, 1]
            base = LogisticRegression(max_iter=500).fit(df.iloc[tr][["TyreLife"]].values, y[tr])
            oof_base[te] = base.predict_proba(df.iloc[te][["TyreLife"]].values)[:, 1]
        out.metrics = {
            "ROC AUC": roc_auc_score(y, oof), "PR AUC": average_precision_score(y, oof),
            "Baseline ROC AUC": roc_auc_score(y, oof_base), "Baseline PR AUC": average_precision_score(y, oof_base),
            "Pit rate": float(y.mean()),
        }
        out.model = gbm().fit(X, y)
        imp = permutation_importance(out.model, X, y, scoring="average_precision", n_repeats=5, random_state=0)
        out.importance = pd.Series(imp.importances_mean, index=FEATURES).sort_values()
        return out

    @property
    def trained(self) -> bool:
        return self.model is not None

    def predict_proba(self, features: pd.DataFrame) -> np.ndarray:
        if self.trained:
            return self.model.predict_proba(features[FEATURES].values)[:, 1]
        return heuristic_pit_probability(features)


def heuristic_pit_probability(f: pd.DataFrame) -> np.ndarray:
    """Fallback when there is too little data: hazard rises as the tyre nears its usable life."""
    max_life = f["CompoundCode"].map({v: MAX_STINT[k] for k, v in COMPOUND_CODE.items()}).fillna(32)
    x = f["TyreLife"] / max_life
    p = 1 / (1 + np.exp(-(x - 0.85) * 10)) * 0.35
    p = np.where(f["LapsRemaining"] < 4, 0.0, p)
    p = p + 0.15 * f["Neutralised"] * (x > 0.4)
    return np.clip(np.asarray(p, dtype=float), 0, 0.95)
