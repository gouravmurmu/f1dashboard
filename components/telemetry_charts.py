import streamlit as st
import plotly.graph_objects as go
import pandas as pd

def render_telemetry_chart(telemetry_df, driver_code):
    """
    Renders speed and throttle telemetry charts.
    """
    if telemetry_df.empty:
        st.info(f"No telemetry data for {driver_code}")
        return

    st.subheader(f"Telemetry: {driver_code}")
    
    # Create subplots or separate charts
    # Speed Trace
    fig_speed = go.Figure()
    fig_speed.add_trace(go.Scatter(
        x=telemetry_df['Distance'], 
        y=telemetry_df['Speed'],
        mode='lines',
        name='Speed',
        line=dict(color='cyan', width=2)
    ))
    fig_speed.update_layout(
        title="Speed Trace",
        xaxis_title="Distance (m)",
        yaxis_title="Speed (km/h)",
        template="plotly_dark",
        height=300,
        margin=dict(l=20, r=20, t=40, b=20)
    )
    st.plotly_chart(fig_speed, use_container_width=True)
    
    # Throttle/Brake Trace
    fig_controls = go.Figure()
    fig_controls.add_trace(go.Scatter(
        x=telemetry_df['Distance'], 
        y=telemetry_df['Throttle'],
        mode='lines',
        name='Throttle',
        line=dict(color='green', width=2)
    ))
    fig_controls.add_trace(go.Scatter(
        x=telemetry_df['Distance'], 
        y=telemetry_df['Brake'] * 100, # Scale brake to 0-100 for visibility
        mode='lines',
        name='Brake',
        line=dict(color='red', width=2, dash='dot')
    ))
    fig_controls.update_layout(
        title="Throttle & Brake",
        xaxis_title="Distance (m)",
        yaxis_title="Input (%)",
        template="plotly_dark",
        height=300,
        margin=dict(l=20, r=20, t=40, b=20)
    )
    st.plotly_chart(fig_controls, use_container_width=True)
