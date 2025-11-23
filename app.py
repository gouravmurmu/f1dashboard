import streamlit as st
import logging
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("f1dash.log")
    ]
)
logger = logging.getLogger(__name__)

st.set_page_config(
    page_title="F1 Analytics Dashboard",
    page_icon="🏎️",
    layout="wide",
    initial_sidebar_state="expanded"
)

def main():
    st.sidebar.title("🏎️ F1 Analytics")
    st.sidebar.info("Real-time telemetry, predictions, and insights.")
    
    st.sidebar.markdown("---")
    st.sidebar.markdown("### Navigation")
    st.sidebar.markdown("Use the sidebar to navigate between pages.")
    
    st.markdown(
        """
        # Welcome to the F1 Real-Time Analytics Dashboard
        
        This dashboard provides real-time insights into Formula 1 races using data from FastF1.
        
        ### Features:
        - **Live Race Dashboard**: Real-time leaderboard, telemetry, and tire data.
        - **Predictions**: AI-powered pit stop probabilities, tire degradation curves, and race pace forecasts.
        - **Insights**: Deep dives into driver gaps and team performance.
        
        ### How to use:
        Select a page from the sidebar to get started.
        """
    )
    
    # Check for API keys or setup if needed (placeholder)
    if not os.path.exists("backend/cache"):
        os.makedirs("backend/cache", exist_ok=True)

if __name__ == "__main__":
    main()
