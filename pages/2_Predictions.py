import streamlit as st
import pandas as pd
import numpy as np
from backend.data_loader import load_current_session, get_live_leaderboard, get_live_tyre_data
from backend.feature_engineering import FeatureEngineer
from models.model_loader import ModelLoader
from components.prediction_gauges import render_pit_stop_gauge, render_tire_wear_chart, render_pace_forecast

st.set_page_config(page_title="Race Predictions", layout="wide")

st.title("🔮 AI Race Predictions")

# Load Session & Models
session = load_current_session()
model_loader = ModelLoader()
fe = FeatureEngineer()

if not session:
    st.error("No active session found.")
    st.stop()

leaderboard = get_live_leaderboard(session)
if leaderboard.empty:
    st.warning("Waiting for data...")
    st.stop()

# Select Driver for Analysis
drivers = leaderboard['Abbreviation'].tolist()
selected_driver = st.selectbox("Select Driver for Prediction", drivers)

if selected_driver:
    col1, col2 = st.columns(2)
    
    # Pit Stop Prediction
    with col1:
        st.subheader("Pit Stop Probability (Next Lap)")
        # Prepare features (mocked for now)
        # In real app, we'd get actual telemetry for this driver
        pit_features = fe.prepare_pit_stop_features(None, None, None) 
        
        # Get model
        pit_model = model_loader.get_pit_stop_model()
        
        # Predict
        # We need to pass a single sample, let's just use the first row of our mock features
        if not pit_features.empty:
            # Add some randomness based on driver for demo variety
            driver_seed = sum(ord(c) for c in selected_driver)
            np.random.seed(driver_seed)
            
            # Mock input: modify tire age based on random seed
            mock_input = pit_features.iloc[[0]].copy()
            mock_input['TireAge'] = np.random.randint(5, 30)
            
            prob = pit_model.predict_proba(mock_input)[0]
            render_pit_stop_gauge(prob)
        else:
            st.warning("Could not generate features.")

    # Race Pace Forecast
    with col2:
        st.subheader("Race Pace Forecast (Next 5 Laps)")
        pace_model = model_loader.get_race_pace_model()
        
        # Mock recent lap times
        # In real app, get from session.laps
        recent_laps = [90.0, 90.2, 89.8, 90.5, 90.1] 
        predictions = pace_model.predict_next_laps(recent_laps)
        
        render_pace_forecast(predictions)

    # Tire Degradation
    st.subheader("Tire Degradation Curve")
    tyre_data = get_live_tyre_data(session)
    current_compound = "SOFT"
    current_age = 0
    
    if not tyre_data.empty:
        d_data = tyre_data[tyre_data['Driver'] == selected_driver]
        if not d_data.empty:
            current_compound = d_data.iloc[0]['Compound']
            current_age = d_data.iloc[0]['TyreLife']
    
    deg_model = model_loader.get_tire_deg_model()
    wear_curve = deg_model.predict_wear_curve(current_compound, current_age)
    render_tire_wear_chart(wear_curve)
