import pandas as pd
import streamlit as st

st.set_page_config(page_title="Telemetry · F1", page_icon="📡", layout="wide")

from components import charts, theme  # noqa: E402
from components.session import cached_telemetry, race_picker  # noqa: E402

theme.apply_theme()
race, source = race_picker()
src = race.source if race.source == "demo" else source
theme.hero("Telemetry", "Compare two drivers' fastest laps: where they brake, how hard they accelerate and who "
           "owns each part of the track.", tag=race.label.upper())

order = race.results["Driver"].tolist()
colors = race.team_colors
c1, c2 = st.columns(2)
da = c1.selectbox("Driver A", order, index=0)
db = c2.selectbox("Driver B", order, index=1 if len(order) > 1 else 0)

with st.spinner("Loading car telemetry (first load for a live race can take a minute)..."):
    a = cached_telemetry(race.year, race.round, da, src)
    b = cached_telemetry(race.year, race.round, db, src)

fast = race.laps.groupby("Driver")["LapTime"].min()
k = st.columns(4)
for col, d in zip(k[:2], (da, db)):
    if d in fast:
        m, s = divmod(fast[d], 60)
        col.metric(f"{d} fastest lap", f"{int(m)}:{s:06.3f}")
k[2].metric(f"Top speed {da}", f"{a['Speed'].max():.0f} km/h")
k[3].metric(f"Top speed {db}", f"{b['Speed'].max():.0f} km/h", f"{b['Speed'].max() - a['Speed'].max():+.0f}")

left, right = st.columns([3, 2], gap="large")
with left:
    st.plotly_chart(charts.telemetry_chart(a, b, da, db, colors.get(da, theme.RED), colors.get(db, theme.CARBON)),
                    width="stretch")
with right:
    st.plotly_chart(charts.track_dominance(a, b, da, db, colors.get(da, theme.RED), colors.get(db, theme.CARBON)),
                    width="stretch")
    theme.section("Lap profile")
    rows = {}
    for d, t in ((da, a), (db, b)):
        rows[d] = {"Full throttle %": (t["Throttle"] >= 98).mean() * 100, "Braking %": t["Brake"].mean() * 100,
                   "Avg speed (km/h)": t["Speed"].mean(), "Min speed (km/h)": t["Speed"].min(),
                   "Gear changes": int((t["nGear"].diff().fillna(0) != 0).sum())}
    st.dataframe(pd.DataFrame(rows).style.format("{:.1f}"), width="stretch")
