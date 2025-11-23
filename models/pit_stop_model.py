import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
import joblib
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PitStopPredictor:
    def __init__(self):
        self.model = LogisticRegression()
        self.is_trained = False
        
    def train(self, X, y):
        """
        Trains the model.
        X: Feature matrix
        y: Target vector (1 for pit stop, 0 for no pit stop)
        """
        try:
            self.model.fit(X, y)
            self.is_trained = True
            logger.info("PitStopPredictor trained successfully.")
        except Exception as e:
            logger.error(f"Error training PitStopPredictor: {e}")

    def predict_proba(self, X):
        """
        Predicts probability of a pit stop in the next lap.
        """
        if not self.is_trained:
            # Return mock probabilities for demo if not trained
            # Random probability between 0 and 0.3 (low chance usually)
            # Unless tire age is high
            n_samples = X.shape[0] if hasattr(X, 'shape') else len(X)
            
            # Mock logic: higher tire age -> higher probability
            # Assuming 'TireAge' is a column in X if it's a DataFrame
            if isinstance(X, pd.DataFrame) and 'TireAge' in X.columns:
                probs = (X['TireAge'] / 50.0).clip(0, 0.9) # Normalize roughly
                return probs.values
            
            return np.random.uniform(0, 0.3, n_samples)
            
        try:
            return self.model.predict_proba(X)[:, 1]
        except Exception as e:
            logger.error(f"Error predicting pit stop: {e}")
            return np.zeros(len(X))

    def save(self, path="models/pit_stop_model.pkl"):
        try:
            joblib.dump(self.model, path)
            logger.info(f"Model saved to {path}")
        except Exception as e:
            logger.error(f"Error saving model: {e}")

    def load(self, path="models/pit_stop_model.pkl"):
        try:
            if os.path.exists(path):
                self.model = joblib.load(path)
                self.is_trained = True
                logger.info(f"Model loaded from {path}")
            else:
                logger.warning(f"Model file {path} not found. Using mock inference.")
        except Exception as e:
            logger.error(f"Error loading model: {e}")
