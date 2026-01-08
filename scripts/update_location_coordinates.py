#!/usr/bin/env python3
"""Script to update location config with latitude and longitude."""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.location_loader import save_location_config, load_location_config
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Coordinates for Sherburn in Elmet, Leeds
LATITUDE = 53.79764
LONGITUDE = -1.25194


async def update_location_coordinates():
    """Update location config with coordinates."""
    try:
        # Load existing config
        current_config = await load_location_config()
        logger.info(f"Current location config: {current_config}")
        
        # Add coordinates
        current_config["latitude"] = LATITUDE
        current_config["longitude"] = LONGITUDE
        
        # Save updated config
        success = await save_location_config(current_config)
        
        if success:
            logger.info(f"✅ Successfully updated location config with coordinates: lat={LATITUDE}, lon={LONGITUDE}")
            # Verify
            updated_config = await load_location_config()
            logger.info(f"Updated location config: {updated_config}")
        else:
            logger.error("Failed to save location config")
            return False
        
        return True
    except Exception as e:
        logger.error(f"Error updating location coordinates: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    asyncio.run(update_location_coordinates())
