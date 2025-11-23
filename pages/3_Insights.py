import streamlit as st
from backend.data_loader import load_current_session, get_live_leaderboard
from components.analysis_plots import render_driver_comparison, render_team_points

st.set_page_config(page_title="Race Insights", layout="wide")

st.title("📊 Race Insights & Analytics")

session = load_current_session()
if not session:
    st.error("No session data.")
    st.stop()

leaderboard = get_live_leaderboard(session)

col1, col2 = st.columns(2)

with col1:
    st.subheader("Driver Gaps")
    render_driver_comparison(leaderboard)

with col2:
    st.subheader("Team Performance")
    render_team_points(leaderboard)

st.markdown("---")
st.subheader("Session Statistics")
if not leaderboard.empty:
    st.metric("Total Drivers", len(leaderboard))
    st.metric("Finishers", len(leaderboard[leaderboard['Status'] == 'Finished']))
