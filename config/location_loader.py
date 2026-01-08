"""Utility functions for loading location configuration."""
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

LOCATION_CONFIG_PATH = Path(__file__).parent / "location.json"

_DEFAULT_LOCATION = {
    "city": "Unknown",
    "region": "Unknown",
    "postcode": "",
    "display_name": "Unknown Location"
}


async def load_location_config(session: Optional[AsyncSession] = None) -> Dict[str, Any]:
    """Load location configuration from database.
    
    Args:
        session: Optional database session. If None, creates a new one.
    
    Returns:
        Dictionary with location configuration.
    """
    from database.base import AsyncSessionLocal
    
    try:
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            from database.models import LocationConfig
            result = await db_session.execute(select(LocationConfig).limit(1))
            location = result.scalar_one_or_none()
            
            if location:
                config = {
                    "city": location.city or "Unknown",
                    "region": location.region or "Unknown",
                    "postcode": location.postcode or "",
                    "display_name": location.display_name or "Unknown Location"
                }
                if location.location_id:
                    config["location_id"] = location.location_id
                if location.extra_data:
                    # Merge extra_data into config (includes latitude/longitude)
                    if isinstance(location.extra_data, dict):
                        config.update(location.extra_data)
                logger.debug(f"Loaded location config from database: {config.get('display_name', 'Unknown')}")
                return config
            else:
                logger.debug("No location config in database, using defaults")
                return _DEFAULT_LOCATION.copy()
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error loading location config from database: {e}", exc_info=True)
        return _load_location_from_file()


def _load_location_from_file() -> Dict[str, Any]:
    """Fallback: Load location configuration from JSON file."""
    try:
        if not LOCATION_CONFIG_PATH.exists():
            logger.warning(f"Location config file not found at {LOCATION_CONFIG_PATH}, using defaults")
            return _DEFAULT_LOCATION.copy()
        
        with open(LOCATION_CONFIG_PATH, 'r', encoding='utf-8') as f:
            config = json.load(f)
            logger.debug(f"Loaded location config from file: {config.get('display_name', 'Unknown')}")
            return config
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Error loading location config from file: {e}", exc_info=True)
        return _DEFAULT_LOCATION.copy()


async def get_location_display_name(session: Optional[AsyncSession] = None) -> str:
    """Get the display name for the location."""
    config = await load_location_config(session)
    return config.get("display_name", "Unknown Location")


async def get_location_city(session: Optional[AsyncSession] = None) -> str:
    """Get the city name."""
    config = await load_location_config(session)
    return config.get("city", "Unknown")


async def get_location_region(session: Optional[AsyncSession] = None) -> str:
    """Get the region name."""
    config = await load_location_config(session)
    return config.get("region", "Unknown")


async def get_location_postcode(session: Optional[AsyncSession] = None) -> str:
    """Get the postcode."""
    config = await load_location_config(session)
    return config.get("postcode", "")


async def save_location_config(config: Dict[str, Any], session: Optional[AsyncSession] = None) -> bool:
    """Save location configuration to database.
    
    Args:
        config: Dictionary with location configuration.
        session: Optional database session. If None, creates a new one.
    
    Returns:
        True if successful, False otherwise.
    """
    from database.base import AsyncSessionLocal
    
    try:
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            from database.models import LocationConfig
            result = await db_session.execute(select(LocationConfig).limit(1))
            location = result.scalar_one_or_none()
            
            if location:
                location.city = config.get("city")
                location.region = config.get("region")
                location.postcode = config.get("postcode")
                location.display_name = config.get("display_name")
                location.location_id = config.get("location_id")
                # Store any extra keys in extra_data
                extra_keys = {k: v for k, v in config.items() 
                            if k not in ["city", "region", "postcode", "display_name", "location_id"]}
                location.extra_data = extra_keys if extra_keys else None
            else:
                extra_keys = {k: v for k, v in config.items() 
                            if k not in ["city", "region", "postcode", "display_name", "location_id"]}
                db_session.add(LocationConfig(
                    city=config.get("city"),
                    region=config.get("region"),
                    postcode=config.get("postcode"),
                    display_name=config.get("display_name"),
                    location_id=config.get("location_id"),
                    extra_data=extra_keys if extra_keys else None
                ))
            
            if not session:  # Only commit if we created the session
                await db_session.commit()
            
            logger.info(f"Location config saved to database: {config.get('display_name', 'Unknown')}")
            return True
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error saving location config to database: {e}", exc_info=True)
        if not session:  # Only rollback if we created the session
            try:
                await db_session.rollback()
            except:
                pass
        return False

