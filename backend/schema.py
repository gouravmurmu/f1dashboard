from dataclasses import dataclass, field
from typing import Dict

import pandas as pd

# Normalised lap columns produced by every loader (FastF1 or demo):
# Driver, Team, LapNumber, LapTime (s), Time (s, race time at end of lap), Position,
# Compound, TyreLife, Stint, PitIn, PitOut, TrackStatus
LAP_COLUMNS = ["Driver", "Team", "LapNumber", "LapTime", "Time", "Position", "Compound", "TyreLife",
               "Stint", "PitIn", "PitOut", "TrackStatus"]

# Results columns: Position, Driver, FullName, Team, TeamColor, Grid, Status, Points, Gap, LapsCompleted
DRY_COMPOUNDS = ("SOFT", "MEDIUM", "HARD")


@dataclass
class RaceData:
    year: int
    round: int
    event_name: str
    location: str
    date: pd.Timestamp
    total_laps: int
    laps: pd.DataFrame
    results: pd.DataFrame
    weather: Dict[str, float] = field(default_factory=dict)
    source: str = "fastf1"

    @property
    def team_colors(self) -> Dict[str, str]:
        return dict(zip(self.results["Driver"], self.results["TeamColor"]))

    @property
    def label(self) -> str:
        return f"{self.year} {self.event_name}"


def is_neutralised(track_status: pd.Series) -> pd.Series:
    """Safety car (4), VSC (6/7) or red flag (5) at any point during the lap."""
    return track_status.astype(str).str.contains("[4567]", regex=True)
