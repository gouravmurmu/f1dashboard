import fastf1
import pandas as pd
import numpy as np
import logging
from datetime import datetime
from backend.caching import ttl_cache

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Enable FastF1 cache (filesystem cache for persistence across restarts if needed, 
# but we rely on our memory cache for immediate speed)
# fastf1.Cache.enable_cache('backend/cache') # Optional: Enable if we want FS caching

@ttl_cache(ttl_seconds=300) # Cache for 5 minutes
def load_current_session():
    """
    Loads the current or latest F1 session.
    Tries to find a live session, otherwise falls back to the last completed session.
    """
    try:
        # Get current schedule
        now = datetime.now()
        year = now.year
        schedule = fastf1.get_event_schedule(year)
        
        # Find next or current event
        # This is a simplified logic: find the event closest to now
        # In a real scenario, we'd check 'SessionXDate' vs 'now'
        
        # For this demo, we will try to get the latest completed session if no live one exists
        # Or just pick a specific recent exciting race for demo purposes if live fails
        # Let's try to get the last event that happened
        
        past_events = schedule[schedule['EventDate'] < now]
        if not past_events.empty:
            last_event = past_events.iloc[-1]
            round_num = last_event['RoundNumber']
            event_name = last_event['EventName']
            
            logger.info(f"Loading data for {year} Round {round_num}: {event_name}")
            
            session = fastf1.get_session(year, round_num, 'R') # Load Race
            session.load(telemetry=True, laps=True, weather=True)
            return session
        else:
            # Fallback to previous year if early in season
            logger.warning("No events found for current year. Falling back to previous year.")
            session = fastf1.get_session(year - 1, 22, 'R') # Abu Dhabi
            session.load(telemetry=True, laps=True, weather=True)
            return session

    except Exception as e:
        logger.error(f"Error loading session: {e}")
        # Ultimate fallback for demo stability
        return None

def get_session_metadata(session):
    """Extracts metadata from the session object."""
    if not session:
        return {}
    
    return {
        "event_name": session.event.EventName,
        "session_name": session.name,
        "date": session.date,
        "location": session.event.Location,
        "track_temp": session.weather_data['TrackTemp'].mean() if not session.weather_data.empty else "N/A",
        "air_temp": session.weather_data['AirTemp'].mean() if not session.weather_data.empty else "N/A",
        "humidity": session.weather_data['Humidity'].mean() if not session.weather_data.empty else "N/A",
    }

def get_live_leaderboard(session):
    """
    Returns the current leaderboard.
    For a completed session, this returns the final classification.
    """
    if not session:
        return pd.DataFrame()
    
    # FastF1 'results' provides classification
    # We want: Position, Driver, Team, Time/Gap, Points
    try:
        results = session.results
        leaderboard = results[['Position', 'Abbreviation', 'TeamName', 'Time', 'Status', 'Points']].copy()
        leaderboard['Position'] = leaderboard['Position'].fillna(0).astype(int)
        leaderboard = leaderboard.sort_values('Position')
        
        # Format Time: Time is a Timedelta, convert to string
        # For winner, it's the time. For others, it's usually gap.
        # FastF1 results 'Time' is total time for finisher.
        # Let's calculate Gap to leader
        winner_time = leaderboard.iloc[0]['Time']
        leaderboard['Gap'] = leaderboard['Time'] - winner_time
        leaderboard['Gap'] = leaderboard['Gap'].apply(lambda x: f"+{x.total_seconds():.3f}s" if pd.notnull(x) and x.total_seconds() > 0 else "Leader")
        
        # Handle non-finishers
        mask_status = leaderboard['Status'] != 'Finished'
        leaderboard.loc[mask_status, 'Gap'] = leaderboard.loc[mask_status, 'Status']
        
        return leaderboard
    except Exception as e:
        logger.error(f"Error generating leaderboard: {e}")
        return pd.DataFrame()

@ttl_cache(ttl_seconds=60)
def get_car_telemetry(session, driver_code):
    """
    Fetches telemetry for a specific driver.
    """
    if not session:
        return pd.DataFrame()
    
    try:
        laps = session.laps.pick_driver(driver_code)
        if laps.empty:
            return pd.DataFrame()
            
        # Get telemetry for the fastest lap for demo purposes (or last lap)
        fastest_lap = laps.pick_fastest()
        telemetry = fastest_lap.get_telemetry()
        
        # Downsample for faster plotting if needed, but FastF1 is usually okay
        return telemetry[['Date', 'Speed', 'Throttle', 'Brake', 'RPM', 'Gear', 'Distance']]
    except Exception as e:
        logger.error(f"Error fetching telemetry for {driver_code}: {e}")
        return pd.DataFrame()

def get_live_tyre_data(session):
    """
    Returns tyre compound and life for drivers.
    """
    if not session:
        return pd.DataFrame()
        
    try:
        # Get the last lap info for each driver
        # We want to know what tyre they are ON currently (at end of session or current)
        
        driver_tyres = []
        for driver in session.drivers:
            laps = session.laps.pick_driver(driver)
            if not laps.empty:
                last_lap = laps.iloc[-1]
                driver_tyres.append({
                    'Driver': driver,
                    'Compound': last_lap['Compound'],
                    'TyreLife': last_lap['TyreLife'],
                    'Stint': last_lap['Stint']
                })
        
        return pd.DataFrame(driver_tyres)
    except Exception as e:
        logger.error(f"Error fetching tyre data: {e}")
        return pd.DataFrame()
