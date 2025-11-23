import time
from functools import wraps
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Simple in-memory cache dictionary
# Structure: {key: {'data': value, 'expiry': timestamp}}
_CACHE = {}

def ttl_cache(ttl_seconds=300):
    """
    Decorator to cache function results for a specific TTL (Time To Live).
    Useful for API calls to FastF1 to avoid rate limiting and improve performance.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Create a unique key based on function name and arguments
            key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            
            current_time = time.time()
            
            # Check if key exists and is valid
            if key in _CACHE:
                entry = _CACHE[key]
                if current_time < entry['expiry']:
                    logger.info(f"Cache HIT for {key}")
                    return entry['data']
                else:
                    logger.info(f"Cache EXPIRED for {key}")
                    del _CACHE[key]
            
            # Execute function and cache result
            logger.info(f"Cache MISS for {key}. Fetching data...")
            result = func(*args, **kwargs)
            
            _CACHE[key] = {
                'data': result,
                'expiry': current_time + ttl_seconds
            }
            return result
        return wrapper
    return decorator

def clear_cache():
    """Clears the entire in-memory cache."""
    global _CACHE
    _CACHE.clear()
    logger.info("Cache cleared.")
