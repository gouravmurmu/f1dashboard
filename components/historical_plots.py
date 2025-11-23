import streamlit as st
import plotly.express as px
import pandas as pd

def render_season_progress(standings_df, title="Season Progression"):
    """
    Renders a bar chart of current season standings.
    """
    if standings_df.empty:
        st.info("No standings data available.")
        return

    fig = px.bar(
        standings_df,
        x='Points',
        y='Name',
        orientation='h',
        text='Points',
        title=title,
        color='Constructor',
        labels={'Name': 'Driver', 'Points': 'Total Points'}
    )
    fig.update_layout(yaxis={'categoryorder':'total ascending'}, template="plotly_dark", height=600)
    st.plotly_chart(fig, use_container_width=True)

def render_constructor_progress(standings_df):
    """
    Renders constructor standings.
    """
    if standings_df.empty:
        st.info("No constructor data available.")
        return

    fig = px.bar(
        standings_df,
        x='Points',
        y='Constructor',
        orientation='h',
        text='Points',
        title="Constructor Championship",
        color='Constructor', # Use self as color for variety
    )
    fig.update_layout(yaxis={'categoryorder':'total ascending'}, template="plotly_dark")
    st.plotly_chart(fig, use_container_width=True)

def render_race_winners(races_df):
    """
    Renders a pie chart or bar chart of race winners in the season.
    """
    if races_df.empty:
        return
        
    winners = races_df['Winner'].value_counts().reset_index()
    winners.columns = ['Driver', 'Wins']
    
    fig = px.pie(
        winners,
        values='Wins',
        names='Driver',
        title="Race Wins Distribution",
        hole=0.4
    )
    fig.update_layout(template="plotly_dark")
    st.plotly_chart(fig, use_container_width=True)
