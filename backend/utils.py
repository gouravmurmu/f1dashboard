import logging
import os

def setup_logging():
    """
    Sets up logging configuration.
    """
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler("f1dash.log")
        ]
    )

def ensure_directories():
    """
    Ensures necessary directories exist.
    """
    dirs = ["backend/cache", "models", "logs"]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
