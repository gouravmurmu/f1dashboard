import logging

import streamlit as st

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

st.set_page_config(page_title="F1 Race Intelligence", page_icon="🏎️", layout="wide",
                   initial_sidebar_state="expanded")

from components import theme  # noqa: E402
from components.leaderboard import render_results_table  # noqa: E402
from components.session import race_picker  # noqa: E402

theme.apply_theme()
race, source = race_picker()

theme.hero("F1 Race Intelligence", "Race replay, live race simulation, machine-learning strategy models and 75 "
           "years of championship history.", tag=race.label.upper())

res = race.results
winner = res.iloc[0]
c = st.columns(4)
c[0].metric("Winner", f"{winner['Driver']}", winner["Team"])
c[1].metric("Laps", race.total_laps)
stops = race.laps.groupby("Driver")["PitIn"].sum()
c[2].metric("Pit stops", int(stops.sum()), f"{stops.mean():.1f} per driver", delta_color="off")
fastest = race.laps.loc[race.laps["LapTime"].idxmin()]
m, s = divmod(fastest["LapTime"], 60)
c[3].metric("Fastest lap", f"{int(m)}:{s:06.3f}", f"{fastest['Driver']} · lap {int(fastest['LapNumber'])}",
            delta_color="off")

left, right = st.columns([3, 2], gap="large")
with left:
    theme.section("Race classification")
    render_results_table(res, race.team_colors)
with right:
    theme.section("Explore")
    for page, label, icon, blurb in [
        ("pages/1_🏁_Race_Centre.py", "Race Centre", "🏁", "Lap-by-lap replay with a live Monte Carlo finish"),
        ("pages/2_🔮_Predictions.py", "Predictions & Strategy", "🔮",
         "Tyre degradation, pit stop model, pace forecast, strategy optimiser"),
        ("pages/3_📡_Telemetry.py", "Telemetry", "📡", "Speed, throttle, brake, gears and track dominance"),
        ("pages/4_🏆_History.py", "History", "🏆", "Title fights, race explorer, head-to-heads, every champion"),
    ]:
        st.page_link(page, label=f"**{label}**", icon=icon)
        st.markdown(f"<div class='muted' style='margin:-10px 0 8px 34px'>{blurb}</div>", unsafe_allow_html=True)
    if race.weather:
        theme.section("Conditions")
        w = race.weather
        st.markdown(f"🌡️ Air **{w['AirTemp']:.0f}°C** · Track **{w['TrackTemp']:.0f}°C** · "
                    f"Humidity **{w['Humidity']:.0f}%** · {'🌧️ Rain' if w.get('Rainfall') else '☀️ Dry'}")
