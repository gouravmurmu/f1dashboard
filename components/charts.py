from typing import Dict, List, Optional

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from components.theme import BORDER, CARBON, COMPOUND_COLORS, GOLD, MUTED, RED, RED_SOFT, TEAL


def _rgba(hex_color: str, a: float) -> str:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return f"rgba(150,150,150,{a})"
    return f"rgba({int(h[0:2], 16)},{int(h[2:4], 16)},{int(h[4:6], 16)},{a})"


def _driver_styles(drivers: List[str], colors: Dict[str, str]) -> Dict[str, dict]:
    """Team-mates share a colour, so the second driver of each team gets a dashed line."""
    seen, styles = {}, {}
    for d in drivers:
        c = colors.get(d, MUTED)
        styles[d] = dict(color=c, dash="dot" if seen.get(c) else "solid")
        seen[c] = True
    return styles


# ---------- Race centre ----------
def position_chart(laps: pd.DataFrame, upto: int, colors: Dict[str, str], highlight: Optional[list] = None):
    df = laps[laps["LapNumber"] <= upto]
    order = df.sort_values("LapNumber").groupby("Driver").tail(1).sort_values("Position")["Driver"].tolist()
    styles = _driver_styles(order, colors)
    fig = go.Figure()
    for d in order:
        g = df[df["Driver"] == d]
        faded = highlight and d not in highlight
        fig.add_trace(go.Scatter(
            x=g["LapNumber"], y=g["Position"], name=d, mode="lines",
            line=dict(width=1.2 if faded else 2.4, **styles[d]), opacity=0.25 if faded else 1,
            hovertemplate=f"<b>{d}</b> lap %{{x}}: P%{{y}}<extra></extra>"))
        last = g.iloc[-1]
        fig.add_annotation(x=last["LapNumber"], y=last["Position"], text=d, showarrow=False, xanchor="left",
                           xshift=6, font=dict(size=10, color=styles[d]["color"]), opacity=0.3 if faded else 1)
    fig.update_yaxes(autorange="reversed", dtick=1, title="Position")
    fig.update_xaxes(title="Lap", range=[1, max(upto, 2) + 3])
    fig.update_layout(title="Race positions", height=470, showlegend=False)
    return fig


def gap_chart(laps: pd.DataFrame, upto: int, colors: Dict[str, str], drivers: List[str]):
    df = laps[laps["LapNumber"] <= upto]
    leader = df.loc[df["Position"] == 1].set_index("LapNumber")["Time"]
    styles = _driver_styles(drivers, colors)
    fig = go.Figure()
    for d in drivers:
        g = df[df["Driver"] == d].set_index("LapNumber")
        gap = (g["Time"] - leader.reindex(g.index)).clip(upper=120)
        fig.add_trace(go.Scatter(x=gap.index, y=gap, name=d, mode="lines", line=dict(width=2.2, **styles[d])))
    sc = df.groupby("LapNumber")["TrackStatus"].first()
    for lap in sc.index[sc.astype(str).str.contains("[4567]")]:
        fig.add_vrect(x0=lap - 1, x1=lap, fillcolor=_rgba(GOLD, 0.18), line_width=0, layer="below")
    fig.update_yaxes(autorange="reversed", title="Gap to leader (s)")
    fig.update_layout(title="Gap to leader  ·  yellow = safety car", height=360, hovermode="x unified")
    return fig


def tyre_strategy_chart(laps: pd.DataFrame, upto: int, order: List[str], total_laps: int):
    df = laps[laps["LapNumber"] <= upto]
    stints = df.groupby(["Driver", "Stint", "Compound"])["LapNumber"].agg(["min", "max"]).reset_index()
    fig = go.Figure()
    shown = set()
    for _, s in stints.iterrows():
        c = s["Compound"]
        fig.add_trace(go.Bar(
            y=[s["Driver"]], x=[s["max"] - s["min"] + 1], base=[s["min"] - 1], orientation="h", name=c,
            marker=dict(color=COMPOUND_COLORS.get(c, MUTED), line=dict(color="#BDBDC6" if c == "HARD" else "white",
                                                                     width=1)),
            showlegend=c not in shown, legendgroup=c,
            hovertemplate=f"{s['Driver']} · {c}: laps {s['min']}-{s['max']}<extra></extra>"))
        shown.add(c)
    fig.update_yaxes(categoryorder="array", categoryarray=order[::-1])
    fig.update_xaxes(range=[0, total_laps], title="Lap")
    fig.update_layout(title="Tyre strategy", barmode="overlay", height=max(320, 22 * len(order) + 90), bargap=0.25)
    return fig


def win_probability_chart(summary: pd.DataFrame, colors: Dict[str, str]):
    s = summary.head(10).iloc[::-1]
    fig = go.Figure()
    fig.add_trace(go.Bar(y=s["Driver"], x=s["Points %"], orientation="h", name="Points",
                         marker_color=RED_SOFT, hovertemplate="%{y}: %{x:.0f}% points<extra></extra>"))
    fig.add_trace(go.Bar(y=s["Driver"], x=s["Podium %"], orientation="h", name="Podium",
                         marker_color=_rgba(RED, 0.5), hovertemplate="%{y}: %{x:.0f}% podium<extra></extra>"))
    fig.add_trace(go.Bar(y=s["Driver"], x=s["Win %"], orientation="h", name="Win", marker_color=RED,
                         hovertemplate="%{y}: %{x:.0f}% win<extra></extra>"))
    fig.update_layout(barmode="overlay", title="Finish probabilities", xaxis=dict(range=[0, 100], ticksuffix="%"),
                      height=380)
    return fig


def position_heatmap(dist: pd.DataFrame, order: List[str]):
    d = dist.loc[order]
    fig = go.Figure(go.Heatmap(
        z=d.values * 100, x=[f"P{c}" for c in d.columns], y=d.index, zmin=0, zmax=100,
        colorscale=[[0, "#FFFFFF"], [0.15, RED_SOFT], [1, RED]], colorbar=dict(ticksuffix="%", len=0.8),
        hovertemplate="%{y} finishes %{x}: %{z:.0f}%<extra></extra>"))
    fig.update_yaxes(autorange="reversed")
    fig.update_layout(title="Predicted finishing position distribution", height=max(360, 22 * len(order) + 100))
    return fig


# ---------- Predictions ----------
def degradation_chart(tyre, clean: pd.DataFrame):
    fig = go.Figure()
    for c in ("SOFT", "MEDIUM", "HARD"):
        col = COMPOUND_COLORS[c] if c != "HARD" else "#9C9CA6"
        pts = clean[clean["Compound"] == c]
        if not pts.empty:
            fuel_corr = pts["LapTime"] - tyre.fuel_effect * pts["LapNumber"] - pts["Driver"].map(tyre.driver_pace) \
                - tyre.base - tyre.compound_params(c)[0]
            fig.add_trace(go.Scatter(x=pts["TyreLife"], y=fuel_corr, mode="markers", name=f"{c} laps",
                                     marker=dict(color=_rgba(col, 0.25), size=5), showlegend=False,
                                     hoverinfo="skip"))
        curve = tyre.degradation_curve(c, 45)
        fig.add_trace(go.Scatter(x=curve.index, y=curve.values, name=c, mode="lines", line=dict(color=col, width=4)))
    fig.update_layout(title="Tyre degradation (fuel and driver corrected)", xaxis_title="Tyre age (laps)",
                      yaxis_title="Seconds lost vs fresh tyre", height=420, yaxis=dict(range=[-1.5, 5]))
    return fig


def importance_chart(imp: pd.Series):
    fig = go.Figure(go.Bar(x=imp.values, y=imp.index, orientation="h",
                           marker_color=[RED if v == imp.max() else _rgba(RED, 0.45) for v in imp.values]))
    fig.update_layout(title="What drives a pit call (permutation importance)", height=340, showlegend=False)
    return fig


def pit_probability_heatmap(df: pd.DataFrame, order: List[str]):
    piv = df.pivot_table(index="Driver", columns="LapNumber", values="PitProb").reindex(order)
    pits = df[df["PitIn"]]
    fig = go.Figure(go.Heatmap(z=piv.values * 100, x=piv.columns, y=piv.index, zmin=0, zmax=60,
                               colorscale=[[0, "#FFFFFF"], [0.3, RED_SOFT], [1, RED]],
                               colorbar=dict(ticksuffix="%", len=0.8),
                               hovertemplate="%{y} lap %{x}: %{z:.0f}%<extra></extra>"))
    fig.add_trace(go.Scatter(x=pits["LapNumber"], y=pits["Driver"], mode="markers", name="Actual stop",
                             marker=dict(symbol="x-thin", size=10, line=dict(width=2.5, color=CARBON))))
    fig.update_yaxes(autorange="reversed")
    fig.update_layout(title="Pit probability by lap  ·  ✕ = actual stop", height=max(380, 22 * len(order) + 100),
                      xaxis_title="Lap")
    return fig


def pace_forecast_chart(hist: pd.DataFrame, forecast: pd.DataFrame, driver: str, color: str):
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=hist["LapNumber"], y=hist["LapTime"], mode="lines+markers", name="Actual",
                             line=dict(color=CARBON, width=2), marker=dict(size=4)))
    fig.add_trace(go.Scatter(x=forecast["LapNumber"], y=forecast["Upper"], line=dict(width=0), showlegend=False,
                             hoverinfo="skip"))
    fig.add_trace(go.Scatter(x=forecast["LapNumber"], y=forecast["Lower"], fill="tonexty", line=dict(width=0),
                             fillcolor=_rgba(RED, 0.15), name="90% band"))
    fig.add_trace(go.Scatter(x=forecast["LapNumber"], y=forecast["Pred"], mode="lines", name="Forecast",
                             line=dict(color=RED, width=3, dash="dash")))
    fig.update_layout(title=f"{driver} pace forecast", xaxis_title="Lap", yaxis_title="Lap time (s)", height=380,
                      hovermode="x unified")
    return fig


def strategy_chart(plans: pd.DataFrame, total_laps: int):
    fig = go.Figure()
    shown = set()
    for i, row in plans.iterrows():
        start = 0
        label = f"{row['Plan']}  (+{row['Delta (s)']:.1f}s)"
        for c, n in row["Stints"]:
            fig.add_trace(go.Bar(y=[label], x=[n], base=[start], orientation="h", name=c, legendgroup=c,
                                 showlegend=c not in shown,
                                 marker=dict(color=COMPOUND_COLORS[c],
                                             line=dict(color="#BDBDC6" if c == "HARD" else "white", width=1)),
                                 hovertemplate=f"{c}: laps {start + 1}-{start + n}<extra></extra>"))
            shown.add(c)
            start += n
    fig.update_yaxes(autorange="reversed")
    fig.update_xaxes(range=[0, total_laps], title="Lap")
    fig.update_layout(title="Fastest strategies", barmode="overlay", height=60 + 42 * len(plans), bargap=0.35)
    return fig


# ---------- Telemetry ----------
def telemetry_chart(a: pd.DataFrame, b: pd.DataFrame, da: str, db: str, ca: str, cb: str):
    if ca == cb:
        cb = CARBON
    fig = make_subplots(rows=5, cols=1, shared_xaxes=True, vertical_spacing=0.03,
                        row_heights=[0.34, 0.16, 0.16, 0.12, 0.22],
                        subplot_titles=("Speed (km/h)", "Throttle (%)", "Brake", "Gear", f"Delta: {db} vs {da} (s)"))
    for df, name, col in ((a, da, ca), (b, db, cb)):
        for row, ch in enumerate(["Speed", "Throttle", "Brake", "nGear"], start=1):
            y = df[ch].astype(float)
            fig.add_trace(go.Scatter(x=df["Distance"], y=y, name=name, legendgroup=name, showlegend=row == 1,
                                     line=dict(color=col, width=1.8, shape="hv" if ch in ("nGear", "Brake") else None)),
                          row=row, col=1)
    delta = delta_time(a, b)
    fig.add_trace(go.Scatter(x=delta.index, y=delta.values, fill="tozeroy", line=dict(color=RED, width=1.5),
                             fillcolor=_rgba(RED, 0.15), name="Delta", showlegend=False), row=5, col=1)
    fig.update_xaxes(title="Distance (m)", row=5, col=1)
    fig.update_layout(height=820, hovermode="x unified", title="Fastest lap comparison")
    return fig


def delta_time(a: pd.DataFrame, b: pd.DataFrame, n: int = 600) -> pd.Series:
    """Positive = second driver is behind at that point of the lap."""
    dist = np.linspace(0, min(a["Distance"].max(), b["Distance"].max()), n)
    ta = np.interp(dist, a["Distance"], a["Time"])
    tb = np.interp(dist, b["Distance"], b["Time"])
    return pd.Series(tb - ta, index=dist)


def track_dominance(a: pd.DataFrame, b: pd.DataFrame, da: str, db: str, ca: str, cb: str, sectors: int = 25):
    if ca == cb:
        cb = CARBON
    dist = np.linspace(0, min(a["Distance"].max(), b["Distance"].max()), sectors + 1)
    fig = go.Figure()
    for i in range(sectors):
        ma = (a["Distance"] >= dist[i]) & (a["Distance"] <= dist[i + 1])
        mb = (b["Distance"] >= dist[i]) & (b["Distance"] <= dist[i + 1])
        faster_a = a.loc[ma, "Speed"].mean() >= b.loc[mb, "Speed"].mean()
        seg = a[ma]
        fig.add_trace(go.Scatter(x=seg["X"], y=seg["Y"], mode="lines", line=dict(color=ca if faster_a else cb,
                                                                                 width=8),
                                 showlegend=False, hoverinfo="skip"))
    for name, col in ((da, ca), (db, cb)):
        fig.add_trace(go.Scatter(x=[None], y=[None], mode="lines", line=dict(color=col, width=8), name=name))
    fig.update_xaxes(visible=False, constrain="domain")
    fig.update_yaxes(visible=False, scaleanchor="x", constrain="domain")
    fig.update_layout(title="Track dominance (faster driver per mini-sector)", height=420,
                      plot_bgcolor="white")
    return fig


# ---------- History ----------
def progression_chart(prog: pd.DataFrame, races: pd.Series, top: int = 10, colors: Optional[dict] = None):
    final = prog.iloc[-1].sort_values(ascending=False)
    fig = go.Figure()
    for i, name in enumerate(final.index[:top]):
        col = (colors or {}).get(name)
        fig.add_trace(go.Scatter(x=prog.index, y=prog[name], name=name, mode="lines+markers",
                                 line=dict(width=3 if i < 3 else 1.8, color=col), marker=dict(size=4),
                                 customdata=races.reindex(prog.index).values,
                                 hovertemplate=f"<b>{name}</b><br>%{{customdata}}: %{{y:.0f}} pts<extra></extra>"))
    fig.update_layout(title="Championship progression", xaxis_title="Round", yaxis_title="Points", height=500,
                      hovermode="closest", legend=dict(orientation="v", x=1.01, xanchor="left", y=1, yanchor="top"))
    return fig


def grid_vs_finish(race: pd.DataFrame):
    fig = go.Figure()
    for _, r in race.iterrows():
        gained = r["Grid"] - r["Position"]
        col = TEAL if gained > 0 else (RED if gained < 0 else MUTED)
        fig.add_trace(go.Scatter(x=["Grid", "Finish"], y=[r["Grid"], r["Position"]], mode="lines+markers+text",
                                 text=[r["Driver"], f"{r['Driver']} ({gained:+d})"],
                                 textposition=["middle left", "middle right"], line=dict(color=col, width=2),
                                 marker=dict(size=8), showlegend=False,
                                 hovertemplate=f"{r['DriverName']}: P{r['Grid']} → P{r['Position']}<extra></extra>"))
    fig.update_yaxes(autorange="reversed", dtick=1, title="Position")
    fig.update_xaxes(range=[-0.6, 1.6])
    fig.update_layout(title="Grid vs finish", height=560)
    return fig


def bar(series: pd.Series, title: str, color: str = RED, fmt: str = ".0f", height: int = 380):
    fig = go.Figure(go.Bar(x=series.values, y=series.index, orientation="h", marker_color=color,
                           texttemplate=f"%{{x:{fmt}}}", textposition="outside"))
    fig.update_yaxes(autorange="reversed")
    fig.update_layout(title=title, height=height, showlegend=False, xaxis=dict(gridcolor=BORDER))
    return fig


def h2h_chart(df: pd.DataFrame, a: str, b: str):
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df["Race"], y=df[f"{a} finish"], name=a, mode="lines+markers",
                             line=dict(color=RED, width=3), marker=dict(size=9)))
    fig.add_trace(go.Scatter(x=df["Race"], y=df[f"{b} finish"], name=b, mode="lines+markers",
                             line=dict(color=CARBON, width=3, dash="dot"), marker=dict(size=9, symbol="diamond")))
    fig.update_yaxes(autorange="reversed", title="Finish position")
    fig.update_layout(title="Race-by-race finishing positions", height=400, hovermode="x unified")
    return fig
