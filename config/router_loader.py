"""Router configuration loader."""
import logging
from typing import Optional, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def load_router_config(session: Optional[AsyncSession] = None) -> Optional[Dict[str, Any]]:
    """Load router configuration from database.
    
    Args:
        session: Optional database session. If None, creates a new one.
    
    Returns:
        Dictionary with router configuration or None if not found.
    """
    from database.base import AsyncSessionLocal
    from database.models import RouterConfig
    
    try:
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            result = await db_session.execute(select(RouterConfig).limit(1))
            router = result.scalar_one_or_none()
            
            if router:
                return router.config_data
            else:
                logger.warning("No router config found in database")
                return None
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error loading router config from database: {e}", exc_info=True)
        return None


async def save_router_config(config: Dict[str, Any], session: Optional[AsyncSession] = None) -> bool:
    """Save router configuration to database.
    
    Args:
        config: Dictionary with router configuration.
        session: Optional database session. If None, creates a new one.
    
    Returns:
        True if successful, False otherwise.
    """
    from database.base import AsyncSessionLocal
    from database.models import RouterConfig
    
    try:
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            result = await db_session.execute(select(RouterConfig).limit(1))
            router = result.scalar_one_or_none()
            
            if router:
                router.config_data = config
            else:
                db_session.add(RouterConfig(config_data=config))
            
            if not session:  # Only commit if we created the session
                await db_session.commit()
            
            logger.info("Router config saved to database")
            return True
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error saving router config to database: {e}", exc_info=True)
        if not session:
            try:
                await db_session.rollback()
            except:
                pass
        return False
