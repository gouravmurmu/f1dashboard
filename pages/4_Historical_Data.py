import streamlit as st
import pandas as pd
from backend.historical_data import get_driver_standings_history, get_constructor_standings_history, get_season_races
from components.historical_plots import render_season_progress, render_constructor_progress, render_race_winners
import datetime

st.set_page_config(page_title="Historical Data", layout="wide")

st.title("📜 F1 Historical Data Archive")

# Sidebar controls
current_year = datetime.datetime.now().year
selected_year = st.sidebar.selectbox("Select Season", range(current_year, 1950, -1), index=0)

st.sidebar.markdown("---")
st.sidebar.info(f"Viewing data for the {selected_year} season.")

# Tabs
tab1, tab2, tab3 = st.tabs(["🏆 Driver Standings", "🏎️ Constructor Standings", "🏁 Race Results"])

with tab1:
    st.subheader(f"Driver Championship - {selected_year}")
    with st.spinner("Fetching driver standings..."):
        driver_standings = get_driver_standings_history(selected_year)
    
    if not driver_standings.empty:
        render_season_progress(driver_standings)
        
        with st.expander("View Raw Data"):
            st.dataframe(driver_standings, use_container_width=True)
    else:
        st.warning("No driver standings found for this year.")

with tab2:
    st.subheader(f"Constructor Championship - {selected_year}")
    with st.spinner("Fetching constructor standings..."):
        const_standings = get_constructor_standings_history(selected_year)
        
    if not const_standings.empty:
        render_constructor_progress(const_standings)
        
        with st.expander("View Raw Data"):
            st.dataframe(const_standings, use_container_width=True)
    else:
        st.warning("No constructor standings found for this year.")

with tab3:
    st.subheader(f"Race Results - {selected_year}")
    with st.spinner("Fetching race calendar..."):
        races = get_season_races(selected_year)
        
    if not races.empty:
        col1, col2 = st.columns([2, 1])
        with col1:
            st.dataframe(
                races,
                column_config={
                    "Round": st.column_config.NumberColumn("Rnd", format="%d"),
                    "RaceName": "Grand Prix",
                    "Date": "Date",
                    "Circuit": "Circuit",
                    "Winner": "Winner",
                    "Constructor": "Team",
                    "Laps": st.column_config.NumberColumn("Laps", format="%d"),
                    "Time": "Winning Time"
                },
                hide_index=True,
                use_container_width=True,
                height=500
            )
        with col2:
            render_race_winners(races)
    else:
        st.warning("No races found for this year.")
