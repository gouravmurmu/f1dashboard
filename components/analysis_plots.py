import streamlit as st
import plotly.express as px
import pandas as pd

def render_driver_comparison(leaderboard_df):
    """
    Renders a bar chart comparing driver gaps.
    """
    if leaderboard_df.empty:
        return

    # Convert Gap to numeric for plotting (handle 'Leader' and '+X.Xs')
    plot_df = leaderboard_df.copy()
    
    def parse_gap(x):
        if x == 'Leader': return 0.0
        if isinstance(x, str) and x.startswith('+') and x.endswith('s'):
            try:
                return float(x[1:-1])
            except:
                return None
        return None

    plot_df['GapNumeric'] = plot_df['Gap'].apply(parse_gap)
    plot_df = plot_df.dropna(subset=['GapNumeric'])
    
    # Filter top 10 for readability
    plot_df = plot_df.head(10)
    
    fig = px.bar(
        plot_df, 
        x='Abbreviation', 
        y='GapNumeric',
        color='TeamName',
        title="Top 10 Gaps to Leader",
        labels={'GapNumeric': 'Gap (s)', 'Abbreviation': 'Driver'}
    )
    fig.update_layout(template="plotly_dark")
    st.plotly_chart(fig, use_container_width=True)

def render_team_points(leaderboard_df):
    """
    Renders a pie chart of points by team (for current race/session).
    """
    if leaderboard_df.empty:
        return
        
    # Group by team
    team_points = leaderboard_df.groupby('TeamName')['Points'].sum().reset_index()
    team_points = team_points[team_points['Points'] > 0]
    
    fig = px.pie(
        team_points,
        values='Points',
        names='TeamName',
        title="Points Distribution (Live)",
        hole=0.4
    )
    fig.update_layout(template="plotly_dark")
    st.plotly_chart(fig, use_container_width=True)
