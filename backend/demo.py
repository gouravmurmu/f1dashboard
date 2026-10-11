"""
Synthetic but realistic F1 data, used when FastF1 / Jolpica are unreachable and for tests.

The race generator models fuel burn, compound-specific tyre degradation, pit stops,
a safety car period and the occasional retirement, so every model in the app has
something meaningful to learn from.
"""
from datetime import date, timedelta
from typing import List, Tuple

import numpy as np
import pandas as pd

from backend.schema import RaceData

# abbreviation, full name, team, team colour, pace offset (s/lap vs fastest car). 2026 line-up.
GRID: List[Tuple[str, str, str, str, float]] = [
    ("ANT", "Kimi Antonelli", "Mercedes", "#00D7B6", 0.00),
    ("RUS", "George Russell", "Mercedes", "#00D7B6", 0.08),
    ("HAM", "Lewis Hamilton", "Ferrari", "#ED1131", 0.14),
    ("LEC", "Charles Leclerc", "Ferrari", "#ED1131", 0.12),
    ("NOR", "Lando Norris", "McLaren", "#F47600", 0.15),
    ("PIA", "Oscar Piastri", "McLaren", "#F47600", 0.20),
    ("VER", "Max Verstappen", "Red Bull Racing", "#4781D7", 0.18),
    ("HAD", "Isack Hadjar", "Red Bull Racing", "#4781D7", 0.45),
    ("ALO", "Fernando Alonso", "Aston Martin", "#229971", 0.55),
    ("STR", "Lance Stroll", "Aston Martin", "#229971", 0.75),
    ("GAS", "Pierre Gasly", "Alpine", "#00A1E8", 0.60),
    ("COL", "Franco Colapinto", "Alpine", "#00A1E8", 0.80),
    ("ALB", "Alexander Albon", "Williams", "#1868DB", 0.58),
    ("SAI", "Carlos Sainz", "Williams", "#1868DB", 0.52),
    ("LAW", "Liam Lawson", "Racing Bulls", "#6C98FF", 0.62),
    ("LIN", "Arvid Lindblad", "Racing Bulls", "#6C98FF", 0.78),
    ("OCO", "Esteban Ocon", "Haas F1 Team", "#9C9FA2", 0.70),
    ("BEA", "Oliver Bearman", "Haas F1 Team", "#9C9FA2", 0.62),
    ("HUL", "Nico Hulkenberg", "Audi", "#F50537", 0.72),
    ("BOR", "Gabriel Bortoleto", "Audi", "#F50537", 0.70),
    ("PER", "Sergio Perez", "Cadillac", "#909090", 0.95),
    ("BOT", "Valtteri Bottas", "Cadillac", "#909090", 1.00),
]
GRID_2024 = GRID  # backwards-compatible name

DEMO_CALENDAR = [
    ("Bahrain Grand Prix", "Sakhir", 57, 94.5), ("Saudi Arabian Grand Prix", "Jeddah", 50, 92.0),
    ("Australian Grand Prix", "Melbourne", 58, 81.5), ("Japanese Grand Prix", "Suzuka", 53, 95.0),
    ("Chinese Grand Prix", "Shanghai", 56, 98.0), ("Miami Grand Prix", "Miami", 57, 92.5),
    ("Emilia Romagna Grand Prix", "Imola", 63, 80.5), ("Monaco Grand Prix", "Monaco", 78, 76.0),
    ("Canadian Grand Prix", "Montréal", 70, 77.0), ("Spanish Grand Prix", "Barcelona", 66, 79.0),
    ("Austrian Grand Prix", "Spielberg", 71, 69.0), ("British Grand Prix", "Silverstone", 52, 91.0),
]

# compound: (pace offset s, linear deg s/lap, quadratic deg s/lap^2, max sensible stint)
COMPOUNDS = {"SOFT": (-0.65, 0.085, 0.0016, 22), "MEDIUM": (0.0, 0.050, 0.0009, 32),
             "HARD": (0.45, 0.030, 0.0004, 45)}
FUEL_EFFECT = -0.055   # s per lap gained as fuel burns
PIT_LOSS = 21.5        # seconds lost in the pit lane
POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]


def _race_date(year: int, round_number: int) -> pd.Timestamp:
    return pd.Timestamp(date(year, 3, 1) + timedelta(days=14 * (int(round_number) - 1)))


def _tyre_cost(compound: str, life: np.ndarray) -> np.ndarray:
    off, lin, quad, _ = COMPOUNDS[compound]
    return off + lin * life + quad * life ** 2


def _plan_strategy(rng, total_laps: int) -> List[Tuple[str, int]]:
    """Returns [(compound, stint_length), ...] covering the race."""
    if rng.random() < 0.55:
        first = rng.choice(["MEDIUM", "SOFT"], p=[0.7, 0.3])
        second = "HARD" if first == "MEDIUM" else rng.choice(["HARD", "MEDIUM"])
        stop = int(np.clip(rng.normal(total_laps * (0.42 if first == "MEDIUM" else 0.3), 3), 8, total_laps - 8))
        return [(first, stop), (second, total_laps - stop)]
    first = rng.choice(["SOFT", "MEDIUM"], p=[0.5, 0.5])
    s1 = int(np.clip(rng.normal(total_laps * 0.25, 2.5), 6, total_laps - 20))
    s2 = int(np.clip(rng.normal(total_laps * 0.38, 3), 10, total_laps - s1 - 6))
    return [(first, s1), ("HARD", s2), (rng.choice(["MEDIUM", "SOFT"]), total_laps - s1 - s2)]


def generate_race(year: int = 2024, round_number: int = 1, seed: int = None) -> RaceData:
    seed = seed if seed is not None else year * 100 + round_number
    rng = np.random.default_rng(seed)
    name, location, total_laps, base_lap = DEMO_CALENDAR[(round_number - 1) % len(DEMO_CALENDAR)]
    drivers = GRID
    n = len(drivers)

    # Grid: roughly by pace with qualifying noise
    pace = np.array([d[4] for d in drivers]) + rng.normal(0, 0.12, n)
    grid = np.argsort(np.argsort(pace + rng.normal(0, 0.15, n))) + 1

    sc_start = int(rng.integers(12, total_laps - 12)) if rng.random() < 0.7 else None
    sc_laps = set(range(sc_start, sc_start + int(rng.integers(3, 6)))) if sc_start else set()
    dnf = {int(i): int(rng.integers(5, total_laps - 3)) for i in rng.choice(n, size=rng.integers(0, 3), replace=False)}

    strategies = [_plan_strategy(rng, total_laps) for _ in range(n)]
    cum = (grid - 1) * 0.25  # start gaps from the grid
    state = [{"stint": 0, "life": 1, "lap_in_stint": 0} for _ in range(n)]
    rows = []

    for lap in range(1, total_laps + 1):
        under_sc = lap in sc_laps
        lap_times = np.zeros(n)
        pit_in = np.zeros(n, bool)
        for i in range(n):
            if i in dnf and lap > dnf[i]:
                lap_times[i] = np.nan
                continue
            st_ = state[i]
            compound, length = strategies[i][st_["stint"]]
            t = (base_lap + pace[i] + FUEL_EFFECT * lap + _tyre_cost(compound, np.array(st_["life"]))
                 + rng.normal(0, 0.30))
            if lap == 1:
                t += 4.0 + 0.3 * grid[i]
            if st_["lap_in_stint"] == 0 and st_["stint"] > 0:
                t += PIT_LOSS * (0.55 if under_sc else 1.0) / 2  # pit-out half of the loss
            last_lap_of_stint = st_["lap_in_stint"] + 1 >= length and st_["stint"] < len(strategies[i]) - 1
            # Cars often pit opportunistically under the safety car
            if under_sc and st_["stint"] < len(strategies[i]) - 1 and st_["lap_in_stint"] > length * 0.6:
                last_lap_of_stint = True
            if last_lap_of_stint:
                t += PIT_LOSS * (0.55 if under_sc else 1.0) / 2
                pit_in[i] = True
            lap_times[i] = t

        if under_sc:
            # Field bunches up behind the safety car
            order = np.argsort(np.where(np.isnan(lap_times), np.inf, cum))
            leader_time = cum[order[0]] + base_lap * 1.4
            for k, i in enumerate(order):
                if np.isnan(lap_times[i]):
                    continue
                target = leader_time + 0.7 * k
                lap_times[i] = max(target - cum[i], base_lap * 1.3) + (lap_times[i] - base_lap) * 0.1

        cum = cum + np.nan_to_num(lap_times, nan=0.0)
        running = ~np.isnan(lap_times)
        positions = np.full(n, np.nan)
        order = np.argsort(np.where(running, cum, np.inf))
        for p, i in enumerate(order[: running.sum()], start=1):
            positions[i] = p

        for i in range(n):
            if not running[i]:
                continue
            st_ = state[i]
            compound, _ = strategies[i][st_["stint"]]
            rows.append({
                "Driver": drivers[i][0], "Team": drivers[i][2], "LapNumber": lap, "LapTime": lap_times[i],
                "Time": cum[i], "Position": positions[i], "Compound": compound, "TyreLife": st_["life"],
                "Stint": st_["stint"] + 1, "PitIn": bool(pit_in[i]),
                "PitOut": st_["lap_in_stint"] == 0 and st_["stint"] > 0,
                "TrackStatus": "4" if under_sc else "1",
            })
            if pit_in[i]:
                state[i] = {"stint": st_["stint"] + 1, "life": 1, "lap_in_stint": 0}
            else:
                st_["life"] += 1
                st_["lap_in_stint"] += 1

    laps = pd.DataFrame(rows)
    final = laps.sort_values("LapNumber").groupby("Driver").tail(1).set_index("Driver")
    res = []
    for i, (abbr, full, team, color, _) in enumerate(drivers):
        f = final.loc[abbr]
        finished = i not in dnf
        res.append({"Driver": abbr, "FullName": full, "Team": team, "TeamColor": color, "Grid": int(grid[i]),
                    "Status": "Finished" if finished else "Retired", "LapsCompleted": int(f["LapNumber"]),
                    "RaceTime": f["Time"]})
    results = pd.DataFrame(res)
    results = results.sort_values(["LapsCompleted", "RaceTime"], ascending=[False, True]).reset_index(drop=True)
    results["Position"] = np.arange(1, len(results) + 1)
    results["Points"] = [POINTS[p - 1] if p <= 10 and s == "Finished" else 0
                         for p, s in zip(results["Position"], results["Status"])]
    leader_time = results.loc[0, "RaceTime"]
    results["Gap"] = [
        "Winner" if k == 0 else (f"+{t - leader_time:.3f}s" if s == "Finished" and lc == total_laps
                                 else (f"+{total_laps - lc} lap" + ("s" if total_laps - lc > 1 else "")
                                       if s == "Finished" else s))
        for k, (t, s, lc) in enumerate(zip(results["RaceTime"], results["Status"], results["LapsCompleted"]))
    ]

    weather = {"AirTemp": float(rng.uniform(18, 32)), "TrackTemp": float(rng.uniform(28, 50)),
               "Humidity": float(rng.uniform(30, 70)), "Rainfall": False}
    return RaceData(year=year, round=round_number, event_name=name, location=location,
                    date=_race_date(year, round_number),
                    total_laps=total_laps, laps=laps, results=results.drop(columns=["RaceTime"]), weather=weather,
                    source="demo")


def demo_schedule(year: int) -> pd.DataFrame:
    return pd.DataFrame([{"RoundNumber": i + 1, "EventName": e[0], "Location": e[1],
                          "EventDate": _race_date(year, i + 1)}
                         for i, e in enumerate(DEMO_CALENDAR)])


def generate_telemetry(driver: str, seed: int = 0) -> pd.DataFrame:
    """
    Synthetic fastest-lap telemetry on a stylised 5.4 km circuit. Corner speeds come from
    the track's curvature (lateral grip limit) and straights from simple acceleration and
    braking physics, so the traces look like a real lap.
    """
    rng = np.random.default_rng(seed + sum(map(ord, driver)))
    n = 1800
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    x = np.cos(t) * (1 + 0.30 * np.cos(3 * t) + 0.08 * np.sin(5 * t) + 0.035 * np.cos(9 * t))
    y = np.sin(t) * (1 + 0.25 * np.sin(2 * t) + 0.04 * np.sin(8 * t)) * 0.62
    seg = np.hypot(np.diff(x, append=x[0]), np.diff(y, append=y[0]))
    scale = 5400 / seg.sum()
    x, y, seg = x * scale, y * scale, seg * scale
    distance = np.concatenate([[0], np.cumsum(seg[:-1])])

    dx, dy = np.gradient(x), np.gradient(y)
    ddx, ddy = np.gradient(dx), np.gradient(dy)
    curvature = np.abs(dx * ddy - dy * ddx) / (dx ** 2 + dy ** 2) ** 1.5
    curvature = pd.Series(curvature).rolling(15, center=True, min_periods=1).mean().values
    grip = 16.0 * (1 + rng.normal(0, 0.015))            # effective lateral grip for this stylised layout
    v_corner = np.sqrt(grip / np.maximum(curvature, 1e-5))
    v = np.minimum(v_corner, (338 + rng.normal(0, 2)) / 3.6)

    # Forward pass: traction-limited acceleration that fades with speed
    for _ in range(2):
        for i in range(1, n):
            accel = max(1.0, 13.0 * (1 - (v[i - 1] * 3.6 / 345) ** 2))
            v[i] = min(v[i], np.sqrt(v[i - 1] ** 2 + 2 * accel * seg[i - 1]))
        # Backward pass: braking at ~5g
        for i in range(n - 2, -1, -1):
            v[i] = min(v[i], np.sqrt(v[i + 1] ** 2 + 2 * 48.0 * seg[i]))

    speed = v * 3.6 + rng.normal(0, 0.4, n)
    dv = np.gradient(v)
    braking = dv < -0.25
    at_limit = np.abs(v - v_corner) < 1.5
    throttle = np.where(braking, 0.0, np.where(at_limit & (v * 3.6 < 250), 45.0, 100.0))
    throttle = pd.Series(throttle).rolling(5, center=True, min_periods=1).mean().clip(0, 100).values
    gear = np.digitize(speed, [85, 125, 160, 195, 230, 265, 300]) + 1
    time = np.concatenate([[0], np.cumsum(seg[:-1] / np.maximum(v[:-1], 1))])
    return pd.DataFrame({"Distance": distance, "Speed": speed, "Throttle": throttle, "Brake": braking,
                         "nGear": gear, "X": x, "Y": y, "Time": time})


def demo_history(year: int) -> pd.DataFrame:
    """A season of race results in the same shape as history.season_results()."""
    rng = np.random.default_rng(year)
    rows = []
    for rnd, (name, loc, laps, _) in enumerate(DEMO_CALENDAR, start=1):
        perf = np.array([d[4] for d in GRID]) + rng.normal(0, 0.35, len(GRID))
        grid = np.argsort(np.argsort(perf + rng.normal(0, 0.2, len(perf)))) + 1
        dnf = rng.random(len(perf)) < 0.06
        order = np.argsort(np.where(dnf, 99, perf))
        for pos, i in enumerate(order, start=1):
            d = GRID[i]
            rows.append({"Season": year, "Round": rnd, "RaceName": name, "Date": f"{year}-{3 + rnd // 2:02d}-01",
                         "Circuit": loc, "Country": loc, "Driver": d[0], "DriverName": d[1], "DriverId": d[1],
                         "Constructor": d[2], "Grid": int(grid[i]), "Position": pos,
                         "Points": float(POINTS[pos - 1]) if pos <= 10 and not dnf[i] else 0.0,
                         "Status": "Retired" if dnf[i] else "Finished", "Laps": laps, "Sprint": False})
    return pd.DataFrame(rows)


def demo_champions() -> pd.DataFrame:
    data = [(2024, "Max Verstappen", "Red Bull"), (2023, "Max Verstappen", "Red Bull"),
            (2022, "Max Verstappen", "Red Bull"), (2021, "Max Verstappen", "Red Bull"),
            (2020, "Lewis Hamilton", "Mercedes"), (2019, "Lewis Hamilton", "Mercedes"),
            (2018, "Lewis Hamilton", "Mercedes"), (2017, "Lewis Hamilton", "Mercedes"),
            (2016, "Nico Rosberg", "Mercedes"), (2015, "Lewis Hamilton", "Mercedes"),
            (2014, "Lewis Hamilton", "Mercedes"), (2013, "Sebastian Vettel", "Red Bull"),
            (2012, "Sebastian Vettel", "Red Bull"), (2011, "Sebastian Vettel", "Red Bull"),
            (2010, "Sebastian Vettel", "Red Bull"), (2009, "Jenson Button", "Brawn"),
            (2008, "Lewis Hamilton", "McLaren"), (2007, "Kimi Räikkönen", "Ferrari")]
    return pd.DataFrame([{"Season": s, "Driver": d, "Constructor": c, "Points": np.nan, "Wins": np.nan}
                         for s, d, c in data])
