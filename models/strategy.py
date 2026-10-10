"""Race strategy optimiser: evaluates every one- and two-stop plan with the tyre model."""
from itertools import product

import numpy as np
import pandas as pd

from backend.schema import DRY_COMPOUNDS
from models.pit_model import MAX_STINT
from models.tyre_model import TyreModel


def stint_time(tyre: TyreModel, compound: str, start_lap: int, length: int) -> float:
    """Tyre + fuel time for a stint (driver pace and base lap are common to all plans)."""
    life = np.arange(1, length + 1)
    laps = np.arange(start_lap, start_lap + length)
    return float(np.sum(tyre.tyre_cost(compound, life) + tyre.fuel_effect * laps))


def optimise(tyre: TyreModel, total_laps: int, pit_loss: float, min_stint: int = 6, step: int = 1,
             top: int = 8) -> pd.DataFrame:
    plans = []
    for c1, c2 in product(DRY_COMPOUNDS, repeat=2):
        if c1 == c2:
            continue
        for s1 in range(min_stint, total_laps - min_stint + 1, step):
            s2 = total_laps - s1
            if s1 > MAX_STINT[c1] or s2 > MAX_STINT[c2]:
                continue
            t = stint_time(tyre, c1, 1, s1) + stint_time(tyre, c2, s1 + 1, s2) + pit_loss
            plans.append({"Plan": f"{c1[0]}-{c2[0]}", "Stops": 1, "Stints": [(c1, s1), (c2, s2)], "Time": t})
    for c1, c2, c3 in product(DRY_COMPOUNDS, repeat=3):
        if len({c1, c2, c3}) < 2:
            continue
        for s1 in range(min_stint, total_laps - 2 * min_stint + 1, max(step, 2)):
            for s2 in range(min_stint, total_laps - s1 - min_stint + 1, max(step, 2)):
                s3 = total_laps - s1 - s2
                if s1 > MAX_STINT[c1] or s2 > MAX_STINT[c2] or s3 > MAX_STINT[c3]:
                    continue
                t = (stint_time(tyre, c1, 1, s1) + stint_time(tyre, c2, s1 + 1, s2)
                     + stint_time(tyre, c3, s1 + s2 + 1, s3) + 2 * pit_loss)
                plans.append({"Plan": f"{c1[0]}-{c2[0]}-{c3[0]}", "Stops": 2,
                              "Stints": [(c1, s1), (c2, s2), (c3, s3)], "Time": t})
    df = pd.DataFrame(plans)
    if df.empty:
        return df
    # Keep the best version of each compound sequence, then rank
    df = df.sort_values("Time").groupby("Plan", as_index=False).first().sort_values("Time").head(top)
    df["Delta (s)"] = df["Time"] - df["Time"].min()
    df["Pit laps"] = df["Stints"].apply(lambda st: ", ".join(str(sum(x[1] for x in st[:i + 1]))
                                                             for i in range(len(st) - 1)))
    return df.reset_index(drop=True)
