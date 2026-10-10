import time

import streamlit as st

st.set_page_config(page_title="Race Centre · F1", page_icon="🏁", layout="wide")

from backend.race_data import race_state  # noqa: E402
from components import charts, theme  # noqa: E402
from components.leaderboard import render_live_leaderboard  # noqa: E402
from components.session import cached_race, pit_loss, pit_model, race_picker, tyre_model  # noqa: E402
from models.simulator import RaceSimulator  # noqa: E402

theme.apply_theme()
race, source = race_picker()
data_source = race.source if race.source == "demo" else source
theme.hero("Race Centre", "Replay the race lap by lap. The simulation column plays out the rest of the race "
           "thousands of times from the selected lap.", tag=race.label.upper())


@st.cache_data(show_spinner=False, max_entries=256)
def simulate(year: int, rnd: int, src: str, lap: int, n_sims: int):
    rc, _ = cached_race(year, rnd, src)
    pm, _ = pit_model(year, rnd, src)
    sim = RaceSimulator(rc, tyre_model(year, rnd, src), pm, pit_loss(year, rnd, src))
    res = sim.run(lap, n_sims=n_sims, seed=lap)
    return res.summary(), res.distribution()


colors = race.team_colors
names = dict(zip(race.results["Driver"], race.results["FullName"]))
total = race.total_laps

ctrl = st.columns([5, 1.3, 1.3, 1.4])
lap = ctrl[0].slider("Lap", 1, total, st.session_state.get("rc_lap", max(1, total // 2)), key="lap_slider")
n_sims = ctrl[1].selectbox("Simulations", [200, 500, 1000], index=1)
speed = ctrl[2].selectbox("Replay speed", ["Fast", "Normal", "Slow"], index=0)
ctrl[3].markdown("<div style='height:28px'></div>", unsafe_allow_html=True)
play = ctrl[3].button("▶ Play from here", type="primary", width="stretch")

kpi = st.empty()
tower_col, sim_col = st.columns([1.15, 1], gap="large")
with tower_col:
    theme.section("Timing tower  ·  with projected finish")
    tower = st.empty()
with sim_col:
    theme.section("Live race simulation")
    sim_area = st.empty()


def render(lap_no: int, sims: int, animate: bool = False):
    state = race_state(race.laps, lap_no)
    year, rnd = race.year, race.round
    if lap_no < total:
        summary, dist = simulate(year, rnd, data_source, lap_no, sims)
    else:
        summary, dist = None, None
    leader = state.iloc[0]
    neutral = str(race.laps[race.laps["LapNumber"] == lap_no]["TrackStatus"].iloc[0])
    flag = "🟡 SC / VSC" if any(ch in neutral for ch in "4567") else "🟢 Green"
    with kpi.container():
        c = st.columns(4)
        c[0].metric("Lap", f"{lap_no} / {total}")
        c[1].metric("Leader", leader["Driver"], names.get(leader["Driver"], ""), delta_color="off")
        c[2].metric("Track", flag)
        if summary is not None:
            fav = summary.iloc[0]
            c[3].metric("Predicted winner", fav["Driver"], f"{fav['Win %']:.0f}% chance", delta_color="off")
        else:
            c[3].metric("Winner", leader["Driver"])
    with tower.container():
        render_live_leaderboard(state, colors, summary, names)
    with sim_area.container():
        if summary is None:
            st.success("Chequered flag. Move the slider back to simulate from an earlier lap.")
        else:
            st.plotly_chart(charts.win_probability_chart(summary, colors), width="stretch",
                            key=f"win_{lap_no}_{animate}")
            show = summary[["Driver", "Win %", "Podium %", "Points %", "Exp. Pts"]].head(10)
            st.dataframe(show.style.format({"Win %": "{:.0f}%", "Podium %": "{:.0f}%", "Points %": "{:.0f}%",
                                            "Exp. Pts": "{:.1f}"}).bar(subset=["Win %"], color="#FFB3AE",
                                                                       vmin=0, vmax=100),
                         hide_index=True, width="stretch")
    return state, summary, dist


if play:
    delay = {"Fast": 0.05, "Normal": 0.6, "Slow": 1.5}[speed]
    for lp in range(lap, total + 1):
        state, summary, dist = render(lp, 200, animate=True)
        st.session_state["rc_lap"] = lp
        time.sleep(delay)
    lap = total
else:
    state, summary, dist = render(lap, n_sims)

order = state["Driver"].tolist()
tabs = st.tabs(["📈 Positions", "⏱️ Gaps", "🛞 Tyre strategy", "🎯 Finish distribution"])
with tabs[0]:
    focus = st.multiselect("Highlight drivers", order, default=order[:3], key="hl")
    st.plotly_chart(charts.position_chart(race.laps, lap, colors, focus), width="stretch")
with tabs[1]:
    sel = st.multiselect("Drivers", order, default=order[:6], key="gapdrv")
    st.plotly_chart(charts.gap_chart(race.laps, lap, colors, sel), width="stretch")
with tabs[2]:
    st.plotly_chart(charts.tyre_strategy_chart(race.laps, lap, order, total), width="stretch")
with tabs[3]:
    if dist is not None:
        st.plotly_chart(charts.position_heatmap(dist, summary["Driver"].tolist()), width="stretch")
        st.caption("Each row is a driver's probability of finishing in each position, from the Monte Carlo "
                   "simulation. The simulator uses the fitted tyre model for pace, the pit stop model for strategy "
                   "calls, random safety cars and lap-time noise measured from this race.")
    else:
        st.info("Pick a lap before the finish to see the predicted distribution.")
