import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, LabelEncoder
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FeatureEngineer:
    """
    Handles feature engineering for F1 data.
    """
    def __init__(self):
        self.scaler = StandardScaler()
        self.label_encoders = {}
        
    def prepare_pit_stop_features(self, telemetry_data, weather_data, tire_data):
        """
        Prepares features for Pit Stop Prediction Model.
        
        Features:
        - Tire Age
        - Lap Number
        - Position
        - Gap to Leader
        - Weather (Track Temp)
        - Recent Lap Times (Rolling Mean)
        """
        try:
            # Mock feature creation for demo purposes
            # In a real scenario, we would merge these dataframes on 'Driver' and 'Lap'
            
            # Create a dummy dataframe if inputs are raw
            df = pd.DataFrame()
            
            # Assume we have a merged dataset
            # For now, we return a mock feature set
            
            # Example features
            df['LapNumber'] = [10, 11, 12, 13, 14]
            df['TireAge'] = [10, 11, 12, 13, 14]
            df['Position'] = [1, 2, 3, 4, 5]
            df['TrackTemp'] = [30.5] * 5
            
            return df
        except Exception as e:
            logger.error(f"Error preparing pit stop features: {e}")
            return pd.DataFrame()

    def prepare_tire_deg_features(self, lap_data):
        """
        Prepares features for Tire Degradation Model.
        
        Features:
        - Compound (One-Hot)
        - Laps driven on set
        - Track Temp
        - Circuit ID (Label Encoded)
        """
        try:
            if lap_data.empty:
                return pd.DataFrame()
                
            features = lap_data[['Compound', 'TyreLife', 'LapNumber']].copy()
            
            # Encode Compound
            if 'Compound' not in self.label_encoders:
                self.label_encoders['Compound'] = LabelEncoder()
                # Fit with common compounds to ensure consistency
                self.label_encoders['Compound'].fit(['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'])
            
            # Handle unseen labels safely (simple approach for demo)
            # In prod, we'd handle this more robustly
            known_compounds = set(self.label_encoders['Compound'].classes_)
            features['Compound'] = features['Compound'].apply(lambda x: x if x in known_compounds else 'SOFT')
            
            features['Compound_Encoded'] = self.label_encoders['Compound'].transform(features['Compound'])
            
            return features[['Compound_Encoded', 'TyreLife', 'LapNumber']]
        except Exception as e:
            logger.error(f"Error preparing tire deg features: {e}")
            return pd.DataFrame()

    def prepare_race_pace_features(self, lap_data):
        """
        Prepares features for Race Pace Prediction.
        
        Features:
        - Previous 3 Lap Times
        - Fuel Load (proxy via Lap Number)
        - Tire Age
        """
        try:
            if lap_data.empty:
                return pd.DataFrame()
                
            # Create lag features
            df = lap_data[['LapTime', 'LapNumber', 'TyreLife']].copy()
            
            # Convert LapTime to seconds
            df['LapTimeSeconds'] = df['LapTime'].dt.total_seconds()
            
            # Create lags
            df['LapTime_Lag1'] = df['LapTimeSeconds'].shift(1)
            df['LapTime_Lag2'] = df['LapTimeSeconds'].shift(2)
            df['LapTime_Lag3'] = df['LapTimeSeconds'].shift(3)
            
            df = df.dropna()
            
            return df[['LapNumber', 'TyreLife', 'LapTime_Lag1', 'LapTime_Lag2', 'LapTime_Lag3']]
        except Exception as e:
            logger.error(f"Error preparing race pace features: {e}")
            return pd.DataFrame()
