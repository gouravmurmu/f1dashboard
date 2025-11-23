import streamlit as st
import plotly.graph_objects as go

def render_pit_stop_gauge(probability):
    """
    Renders a gauge chart for pit stop probability.
    """
    fig = go.Figure(go.Indicator(
        mode = "gauge+number",
        value = probability * 100,
        domain = {'x': [0, 1], 'y': [0, 1]},
        title = {'text': "Pit Stop Probability"},
        gauge = {
            'axis': {'range': [0, 100]},
            'bar': {'color': "darkblue"},
            'steps': [
                {'range': [0, 30], 'color': "green"},
                {'range': [30, 70], 'color': "yellow"},
                {'range': [70, 100], 'color': "red"}],
            'threshold': {
                'line': {'color': "red", 'width': 4},
                'thickness': 0.75,
                'value': 90}
        }
    ))
    
    fig.update_layout(height=300, margin=dict(l=20, r=20, t=40, b=20))
    st.plotly_chart(fig, use_container_width=True)

def render_tire_wear_chart(wear_curve):
    """
    Renders a line chart for predicted tire wear/lap time loss.
    """
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        y=wear_curve,
        mode='lines+markers',
        name='Predicted Time Loss',
        line=dict(color='orange', width=3)
    ))
    
    fig.update_layout(
        title="Predicted Tire Degradation (Time Loss)",
        xaxis_title="Future Laps",
        yaxis_title="Time Loss (s)",
        template="plotly_dark",
        height=300
    )
    st.plotly_chart(fig, use_container_width=True)

def render_pace_forecast(pace_predictions):
    """
    Renders a chart for race pace forecast.
    """
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        y=pace_predictions,
        mode='lines+markers',
        name='Predicted Pace',
        line=dict(color='purple', width=3, dash='dash')
    ))
    
    fig.update_layout(
        title="Next 5 Laps Pace Forecast",
        xaxis_title="Future Laps",
        yaxis_title="Lap Time (s)",
        template="plotly_dark",
        height=300
    )
    st.plotly_chart(fig, use_container_width=True)
