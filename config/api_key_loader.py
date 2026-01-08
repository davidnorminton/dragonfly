"""Utility functions for loading and saving API keys configuration."""
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

API_KEYS_CONFIG_PATH = Path(__file__).parent / "api_keys.json"


async def load_api_keys(session: Optional[AsyncSession] = None) -> Dict[str, Any]:
    """Load API keys configuration from database.
    
    Args:
        session: Optional database session. If None, creates a new one.
    
    Returns:
        Dictionary with API keys configuration.
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
            from database.models import ApiKeysConfig
            result = await db_session.execute(select(ApiKeysConfig))
            api_keys_list = result.scalars().all()
            
            config = {}
            for api_key_config in api_keys_list:
                service_config = {}
                if api_key_config.api_key:
                    service_config["api_key"] = api_key_config.api_key
                if api_key_config.config_data:
                    service_config.update(api_key_config.config_data)
                config[api_key_config.service_name] = service_config
            
            logger.debug("Loaded API keys config from database")
            return config
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error loading API keys config from database: {e}", exc_info=True)
        # Fallback to file if database fails
        return _load_api_keys_from_file()


def _load_api_keys_from_file() -> Dict[str, Any]:
    """Fallback: Load API keys configuration from JSON file."""
    try:
        if not API_KEYS_CONFIG_PATH.exists():
            logger.warning(f"API keys config file not found at {API_KEYS_CONFIG_PATH}, using defaults")
            return {}
        
        with open(API_KEYS_CONFIG_PATH, 'r', encoding='utf-8') as f:
            config = json.load(f)
            logger.debug("Loaded API keys config from file")
            return config
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Error loading API keys config from file: {e}", exc_info=True)
        return {}


async def save_api_keys(config: Dict[str, Any], session: Optional[AsyncSession] = None) -> bool:
    """Save API keys configuration to database.
    
    Args:
        config: Dictionary with API keys configuration.
        session: Optional database session. If None, creates a new one.
    
    Returns:
        True if successful, False otherwise.
    """
    from database.base import AsyncSessionLocal
    from database.models import ApiKeysConfig
    
    try:
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            for service_name, service_data in config.items():
                api_key = service_data.get("api_key")
                config_data = {k: v for k, v in service_data.items() if k != "api_key"}
                
                from database.models import ApiKeysConfig
                existing = await db_session.scalar(
                    select(ApiKeysConfig).where(ApiKeysConfig.service_name == service_name)
                )
                
                if existing:
                    existing.api_key = api_key
                    existing.config_data = config_data if config_data else None
                else:
                    db_session.add(ApiKeysConfig(
                        service_name=service_name,
                        api_key=api_key,
                        config_data=config_data if config_data else None
                    ))
            
            if not session:  # Only commit if we created the session
                await db_session.commit()
            
            logger.info("API keys config saved to database")
            return True
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error saving API keys config to database: {e}", exc_info=True)
        if not session:  # Only rollback if we created the session
            try:
                await db_session.rollback()
            except:
                pass
        return False


