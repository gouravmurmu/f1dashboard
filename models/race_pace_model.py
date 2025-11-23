import pandas as pd
import numpy as np
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RacePacePredictor:
    def __init__(self):
        pass # Simple time series logic for now, no complex model object needed for mock
        
    def predict_next_laps(self, recent_lap_times, n_laps=5):
        """
        Predicts pace for the next n_laps based on recent history.
        recent_lap_times: list or array of recent lap times (seconds)
        """
        try:
            if len(recent_lap_times) < 3:
                # Not enough data, return last known or default
                last_lap = recent_lap_times[-1] if len(recent_lap_times) > 0 else 90.0
                return [last_lap] * n_laps
            
            # Simple moving average + trend
            # Calculate trend
            recent = np.array(recent_lap_times)
            avg_pace = np.mean(recent)
            trend = np.mean(np.diff(recent)) # Positive means slowing down
            
            predictions = []
            current_pace = recent[-1]
            
            for i in range(n_laps):
                # Add trend and a bit of noise/degradation
                next_lap = current_pace + trend + (0.05 * (i+1)) # Assumes slight degradation
                predictions.append(next_lap)
                current_pace = next_lap
                
            return predictions
            
        except Exception as e:
            logger.error(f"Error predicting race pace: {e}")
            return [90.0] * n_laps
