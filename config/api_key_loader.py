"""Utility functions for loading and saving API keys configuration."""
import json
import logging
from pathlib import Path
from typing import Dict, Any

logger = logging.getLogger(__name__)

API_KEYS_CONFIG_PATH = Path(__file__).parent / "api_keys.json"


def load_api_keys() -> Dict[str, Any]:
    """Load API keys configuration from JSON file."""
    try:
        if not API_KEYS_CONFIG_PATH.exists():
            logger.warning(f"API keys config file not found at {API_KEYS_CONFIG_PATH}, using defaults")
            return {}
        
        with open(API_KEYS_CONFIG_PATH, 'r', encoding='utf-8') as f:
            config = json.load(f)
            logger.debug("Loaded API keys config")
            return config
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Error loading API keys config: {e}", exc_info=True)
        return {}


def save_api_keys(config: Dict[str, Any]) -> bool:
    """Save API keys configuration to JSON file.
    
    Args:
        config: Dictionary with API keys configuration.
    
    Returns:
        True if successful, False otherwise.
    """
    try:
        # Ensure the config directory exists
        API_KEYS_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        
        with open(API_KEYS_CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        logger.info("API keys config saved")
        return True
    except Exception as e:
        logger.error(f"Error saving API keys config: {e}", exc_info=True)
        return False


