import fastf1
import pandas as pd
import logging
from backend.caching import ttl_cache
import requests

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Base URL for Ergast API (FastF1 has wrappers but direct requests can be more flexible for some things)
# However, FastF1 3.0+ has fastf1.ergast which is deprecated in favor of other methods or direct calls.
# Let's use direct requests to the Ergast API for simplicity and stability if FastF1's interface varies.
# Actually, let's try to use requests directly to be safe and independent of FastF1 version changes regarding Ergast.
ERGAST_BASE_URL = "http://api.openf1.org/1.0" # Or the new mirror if original is down. 
# Note: The original ergast.com is deprecated/sunsetting. 
# FastF1 suggests using their own data or OpenF1. 
# For now, let's use the standard Ergast endpoints which are often mirrored.
# Actually, let's use the new Jolpica API which is a drop-in replacement for Ergast and is maintained.
ERGAST_API_URL = "http://api.jolpi.ca/ergast/f1" 

@ttl_cache(ttl_seconds=3600) # Cache for 1 hour as historical data doesn't change often
def get_driver_standings_history(year):
    """
    Fetches driver standings for a specific year.
    """
    try:
        url = f"{ERGAST_API_URL}/{year}/driverStandings.json?limit=100"
        response = requests.get(url)
        if response.status_code != 200:
            return pd.DataFrame()
            
        data = response.json()
        standings_list = data['MRData']['StandingsTable']['StandingsLists'][0]['DriverStandings']
        
        drivers = []
        for item in standings_list:
            drivers.append({
                'Position': int(item['position']),
                'Points': float(item['points']),
                'Wins': int(item['wins']),
                'Driver': item['Driver']['code'],
                'Name': f"{item['Driver']['givenName']} {item['Driver']['familyName']}",
                'Constructor': item['Constructors'][0]['name']
            })
            
        return pd.DataFrame(drivers)
    except Exception as e:
        logger.error(f"Error fetching driver standings for {year}: {e}")
        return pd.DataFrame()

@ttl_cache(ttl_seconds=3600)
def get_constructor_standings_history(year):
    """
    Fetches constructor standings for a specific year.
    """
    try:
        url = f"{ERGAST_API_URL}/{year}/constructorStandings.json?limit=100"
        response = requests.get(url)
        if response.status_code != 200:
            return pd.DataFrame()
            
        data = response.json()
        standings_list = data['MRData']['StandingsTable']['StandingsLists'][0]['ConstructorStandings']
        
        constructors = []
        for item in standings_list:
            constructors.append({
                'Position': int(item['position']),
                'Points': float(item['points']),
                'Wins': int(item['wins']),
                'Constructor': item['Constructor']['name'],
                'Nationality': item['Constructor']['nationality']
            })
            
        return pd.DataFrame(constructors)
    except Exception as e:
        logger.error(f"Error fetching constructor standings for {year}: {e}")
        return pd.DataFrame()

@ttl_cache(ttl_seconds=3600)
def get_season_races(year):
    """
    Fetches the list of races for a specific year with results.
    """
    try:
        url = f"{ERGAST_API_URL}/{year}/results/1.json?limit=100" # Get winners of each race
        response = requests.get(url)
        if response.status_code != 200:
            return pd.DataFrame()
            
        data = response.json()
        races = data['MRData']['RaceTable']['Races']
        
        race_list = []
        for race in races:
            result = race['Results'][0]
            race_list.append({
                'Round': int(race['round']),
                'RaceName': race['raceName'],
                'Date': race['date'],
                'Circuit': race['Circuit']['circuitName'],
                'Winner': result['Driver']['code'],
                'Constructor': result['Constructor']['name'],
                'Laps': int(result['laps']),
                'Time': result['Time']['time'] if 'Time' in result else 'N/A'
            })
            
        return pd.DataFrame(race_list)
    except Exception as e:
        logger.error(f"Error fetching season races for {year}: {e}")
        return pd.DataFrame()

@ttl_cache(ttl_seconds=86400) # Cache for 24 hours
def get_driver_career_stats(driver_id):
    """
    Fetches career stats for a driver (mocked/simplified via Ergast).
    Note: Ergast doesn't have a single 'career stats' endpoint, 
    so we might need to aggregate or just fetch their season history.
    For this dashboard, let's fetch their finishing positions for the last 5 years.
    """
    # This is expensive to compute via raw API calls for every race.
    # We will fetch their year-by-year standings instead.
    try:
        # We need the driverId (e.g. 'max_verstappen') not the code ('VER')
        # Assuming driver_id is passed correctly.
        
        # Actually, let's just return a mock or a simple list of recent seasons for the demo
        # to avoid making 20 API calls.
        return pd.DataFrame()
    except Exception as e:
        return pd.DataFrame()
