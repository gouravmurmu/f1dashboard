from typing import Dict, Optional

import numpy as np
import pandas as pd
import streamlit as st

from components.theme import tyre_badge


def _fmt_gap(gap: float, k: int, lap_down: bool) -> str:
    if k == 0:
        return "Leader"
    if lap_down or pd.isna(gap):
        return "+1 LAP"
    return f"+{gap:.1f}s"


def render_live_leaderboard(state: pd.DataFrame, colors: Dict[str, str], prediction: Optional[pd.DataFrame] = None,
                            names: Optional[Dict[str, str]] = None) -> None:
    """Timing tower at a given lap. With `prediction`, adds the simulator's projected finish."""
    pred = prediction.set_index("Driver") if prediction is not None else None
    head = "<tr><th>P</th><th>Driver</th><th>Gap</th><th>Int</th><th>Tyre</th><th>Stops</th>"
    head += "<th>Proj.</th><th>Win</th></tr>" if pred is not None else "</tr>"
    rows = []
    leader_lap = state["LapNumber"].max()
    for k, r in state.reset_index(drop=True).iterrows():
        cls = f"p{k + 1}" if k < 3 else ""
        if r.get("Retired", False):
            cls = "out"
        color = colors.get(r["Driver"], "#888")
        title = (names or {}).get(r["Driver"], r["Driver"])
        lap_down = r["LapNumber"] < leader_lap
        interval = "" if k == 0 or pd.isna(r["Interval"]) else f"+{r['Interval']:.1f}"
        gap = "OUT" if r.get("Retired", False) else _fmt_gap(r["Gap"], k, lap_down)
        cells = (f"<td>{k + 1}</td><td title='{title}'><span class='teambar' style='background:{color}'></span>"
                 f"<span class='drv'>{r['Driver']}</span></td><td>{gap}</td><td class='muted'>{interval}</td>"
                 f"<td>{tyre_badge(r['Compound'])} <span class='muted'>{int(r['TyreLife'])}</span></td>"
                 f"<td>{int(r['Stops'])}</td>")
        if pred is not None:
            if r["Driver"] in pred.index:
                p = pred.loc[r["Driver"]]
                move = (k + 1) - p["Exp. Pos"]
                arrow = "▲" if move > 0.5 else ("▼" if move < -0.5 else "•")
                arrow_col = "#00A19C" if move > 0.5 else ("#E10600" if move < -0.5 else "#9C9CA6")
                cells += (f"<td><b>P{p['Exp. Pos']:.1f}</b> <span style='color:{arrow_col}'>{arrow}</span></td>"
                          f"<td><div class='pbar'><span style='width:{np.clip(p['Win %'], 0, 100):.0f}%'></span>"
                          f"</div><span class='muted'>{p['Win %']:.0f}%</span></td>")
            else:
                cells += "<td></td><td></td>"
        rows.append(f"<tr class='{cls}'>{cells}</tr>")
    st.markdown(f"<table class='lb'>{head}{''.join(rows)}</table>", unsafe_allow_html=True)


def render_results_table(results: pd.DataFrame, colors: Dict[str, str]) -> None:
    rows = []
    for k, r in results.reset_index(drop=True).iterrows():
        cls = f"p{k + 1}" if k < 3 else ""
        color = colors.get(r["Driver"], "#888")
        rows.append(
            f"<tr class='{cls}'><td>{int(r['Position'])}</td><td><span class='teambar' style='background:{color}'>"
            f"</span><span class='drv'>{r['Driver']}</span> <span class='muted'>{r['FullName']}</span></td>"
            f"<td class='muted'>{r['Team']}</td><td>{r['Gap']}</td><td>{int(r['Grid']) if r['Grid'] else 'PL'}</td>"
            f"<td><b>{r['Points']:g}</b></td></tr>")
    st.markdown("<table class='lb'><tr><th>P</th><th>Driver</th><th>Team</th><th>Gap</th><th>Grid</th><th>Pts</th>"
                f"</tr>{''.join(rows)}</table>", unsafe_allow_html=True)
