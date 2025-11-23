import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
import joblib
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TireDegradationModel:
    def __init__(self):
        self.model = LinearRegression()
        self.is_trained = False
        
    def train(self, X, y):
        """
        Trains the model.
        X: Features (Compound, Laps driven, etc.)
        y: Target (Lap Time Delta due to wear)
        """
        try:
            self.model.fit(X, y)
            self.is_trained = True
            logger.info("TireDegradationModel trained successfully.")
        except Exception as e:
            logger.error(f"Error training TireDegradationModel: {e}")

    def predict_wear_curve(self, compound, current_age, laps_to_predict=20):
        """
        Predicts lap time degradation for the next N laps.
        Returns a list of predicted time loss (seconds) per lap.
        """
        # Mock logic for demo
        # Softs degrade faster, Hards slower
        base_degradation = 0.05 # seconds per lap
        
        if compound == 'SOFT':
            deg_factor = 1.5
        elif compound == 'MEDIUM':
            deg_factor = 1.0
        elif compound == 'HARD':
            deg_factor = 0.6
        else:
            deg_factor = 1.0
            
        # Generate a curve
        # Wear increases non-linearly usually, but linear for simple demo
        future_laps = np.arange(current_age, current_age + laps_to_predict)
        predicted_loss = (future_laps * base_degradation * deg_factor)
        
        return predicted_loss

    def save(self, path="models/tire_deg_model.pkl"):
        try:
            joblib.dump(self.model, path)
            logger.info(f"Model saved to {path}")
        except Exception as e:
            logger.error(f"Error saving model: {e}")

    def load(self, path="models/tire_deg_model.pkl"):
        try:
            if os.path.exists(path):
                self.model = joblib.load(path)
                self.is_trained = True
                logger.info(f"Model loaded from {path}")
            else:
                logger.warning(f"Model file {path} not found. Using mock inference.")
        except Exception as e:
            logger.error(f"Error loading model: {e}")
