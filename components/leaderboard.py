import streamlit as st
import pandas as pd

def render_leaderboard(leaderboard_df):
    """
    Renders a styled leaderboard dataframe.
    """
    if leaderboard_df.empty:
        st.warning("No leaderboard data available.")
        return

    st.subheader("Live Leaderboard")
    
    # Style the dataframe
    # Highlight the winner, color code gaps
    
    def highlight_leader(s):
        is_leader = s['Position'] == 1
        return ['background-color: #FFD700; color: black' if is_leader else '' for _ in s]

    # Display using st.dataframe with column config
    st.dataframe(
        leaderboard_df,
        column_config={
            "Position": st.column_config.NumberColumn("Pos", format="%d"),
            "Abbreviation": "Driver",
            "TeamName": "Team",
            "Time": "Time/Status",
            "Gap": "Gap",
            "Points": st.column_config.NumberColumn("Pts", format="%.0f"),
        },
        hide_index=True,
        use_container_width=True,
        height=600
    )
