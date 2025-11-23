import streamlit as st
import pandas as pd
from backend.data_loader import load_current_session, get_live_leaderboard, get_session_metadata, get_car_telemetry, get_live_tyre_data
from components.leaderboard import render_leaderboard
from components.telemetry_charts import render_telemetry_chart
import time

st.set_page_config(page_title="Live Race Dashboard", layout="wide")

st.title("🏎️ F1 Live Race Dashboard")

# Load Session
with st.spinner("Loading Session Data..."):
    session = load_current_session()

if not session:
    st.error("Failed to load session data. Please try again later.")
    st.stop()

# Metadata
metadata = get_session_metadata(session)
col1, col2, col3, col4 = st.columns(4)
col1.metric("Event", metadata.get('event_name', 'Unknown'))
col2.metric("Session", metadata.get('session_name', 'Unknown'))
col3.metric("Track Temp", f"{metadata.get('track_temp', 0):.1f} °C")
col4.metric("Air Temp", f"{metadata.get('air_temp', 0):.1f} °C")

# Layout: Leaderboard (Left) | Telemetry & Details (Right)
col_left, col_right = st.columns([1, 1])

with col_left:
    leaderboard = get_live_leaderboard(session)
    render_leaderboard(leaderboard)

with col_right:
    st.subheader("Driver Telemetry")
    
    if not leaderboard.empty:
        drivers = leaderboard['Abbreviation'].tolist()
        selected_driver = st.selectbox("Select Driver", drivers)
        
        if selected_driver:
            telemetry = get_car_telemetry(session, selected_driver)
            render_telemetry_chart(telemetry, selected_driver)
            
            # Tyre Info
            tyre_data = get_live_tyre_data(session)
            if not tyre_data.empty:
                driver_tyre = tyre_data[tyre_data['Driver'] == selected_driver]
                if not driver_tyre.empty:
                    st.info(f"Current Tyre: {driver_tyre.iloc[0]['Compound']} (Age: {driver_tyre.iloc[0]['TyreLife']} laps)")

# Auto-refresh logic (optional, Streamlit reruns on interaction usually)
if st.button("Refresh Data"):
    st.rerun()
