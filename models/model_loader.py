from models.pit_stop_model import PitStopPredictor
from models.tire_deg_model import TireDegradationModel
from models.race_pace_model import RacePacePredictor
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ModelLoader:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelLoader, cls).__new__(cls)
            cls._instance.pit_stop_model = PitStopPredictor()
            cls._instance.tire_deg_model = TireDegradationModel()
            cls._instance.race_pace_model = RacePacePredictor()
            
            # Load pre-trained models if they exist
            # cls._instance.pit_stop_model.load()
            # cls._instance.tire_deg_model.load()
            
        return cls._instance

    def get_pit_stop_model(self):
        return self.pit_stop_model

    def get_tire_deg_model(self):
        return self.tire_deg_model

    def get_race_pace_model(self):
        return self.race_pace_model
