"""Utility functions for loading location configuration."""
import json
import logging
from pathlib import Path
from typing import Dict, Any

logger = logging.getLogger(__name__)

LOCATION_CONFIG_PATH = Path(__file__).parent / "location.json"


def load_location_config() -> Dict[str, Any]:
    """Load location configuration from JSON file."""
    try:
        if not LOCATION_CONFIG_PATH.exists():
            logger.warning(f"Location config file not found at {LOCATION_CONFIG_PATH}, using defaults")
            return {
                "city": "Unknown",
                "region": "Unknown",
                "postcode": "",
                "display_name": "Unknown Location"
            }
        
        with open(LOCATION_CONFIG_PATH, 'r', encoding='utf-8') as f:
            config = json.load(f)
            logger.debug(f"Loaded location config: {config.get('display_name', 'Unknown')}")
            return config
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Error loading location config: {e}", exc_info=True)
        return {
            "city": "Unknown",
            "region": "Unknown",
            "postcode": "",
            "display_name": "Unknown Location"
        }


def get_location_display_name() -> str:
    """Get the display name for the location."""
    config = load_location_config()
    return config.get("display_name", "Unknown Location")


def get_location_city() -> str:
    """Get the city name."""
    config = load_location_config()
    return config.get("city", "Unknown")


def get_location_region() -> str:
    """Get the region name."""
    config = load_location_config()
    return config.get("region", "Unknown")


def get_location_postcode() -> str:
    """Get the postcode."""
    config = load_location_config()
    return config.get("postcode", "")


def save_location_config(config: Dict[str, Any]) -> bool:
    """Save location configuration to JSON file.
    
    Args:
        config: Dictionary with location configuration.
    
    Returns:
        True if successful, False otherwise.
    """
    try:
        # Ensure the config directory exists
        LOCATION_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        
        with open(LOCATION_CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        logger.info(f"Location config saved: {config.get('display_name', 'Unknown')}")
        return True
    except Exception as e:
        logger.error(f"Error saving location config: {e}", exc_info=True)
        return False

