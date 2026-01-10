"""Utilities for loading and managing persona configurations."""
import logging
from typing import Dict, Any, Optional, List
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def get_current_persona_name(session: Optional[AsyncSession] = None) -> str:
    """Get the name of the currently selected persona from database."""
    from database.base import AsyncSessionLocal
    from database.models import PersonaConfig
    
    try:
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            result = await db_session.execute(
                select(PersonaConfig).where(PersonaConfig.is_active == "true").limit(1)
            )
            persona = result.scalar_one_or_none()
            
            if persona:
                return persona.name
            else:
                logger.warning("No active persona found in database, defaulting to 'default'")
                return "default"
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error getting current persona from database: {e}", exc_info=True)
        return "default"


async def set_current_persona(persona_name: str, session: Optional[AsyncSession] = None) -> bool:
    """Set the current persona in database. Returns True if successful."""
    from database.base import AsyncSessionLocal
    from database.models import PersonaConfig
    
    try:
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            # Mark all personas as inactive
            await db_session.execute(
                update(PersonaConfig).values(is_active="false")
            )
            
            # Mark the selected persona as active
            await db_session.execute(
                update(PersonaConfig)
                .where(PersonaConfig.name == persona_name)
                .values(is_active="true")
            )
            
            if not session:  # Only commit if we created the session
                await db_session.commit()
            
            logger.info(f"Set current persona to: {persona_name}")
            return True
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error setting current persona: {e}", exc_info=True)
        if not session:
            try:
                await db_session.rollback()
            except:
                pass
        return False


async def load_persona_config(persona_name: Optional[str] = None, session: Optional[AsyncSession] = None) -> Optional[Dict[str, Any]]:
    """Load a persona configuration from database.
    
    Args:
        persona_name: Name of the persona to load. If None, loads the current persona.
        session: Optional database session. If None, creates a new one.
    
    Returns:
        Dictionary with persona configuration or None if not found.
    """
    from database.base import AsyncSessionLocal
    from database.models import PersonaConfig
    
    try:
        if persona_name is None:
            persona_name = await get_current_persona_name(session)
        
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            result = await db_session.execute(
                select(PersonaConfig).where(PersonaConfig.name == persona_name)
            )
            persona = result.scalar_one_or_none()
            
            if persona:
                return persona.config_data
            else:
                logger.warning(f"Persona '{persona_name}' not found in database")
                return None
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error loading persona config {persona_name}: {e}", exc_info=True)
        return None


async def list_available_personas(session: Optional[AsyncSession] = None) -> List[Dict[str, Any]]:
    """List all available persona configurations from database."""
    from database.base import AsyncSessionLocal
    from database.models import PersonaConfig
    
    try:
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            result = await db_session.execute(select(PersonaConfig))
            personas_list = result.scalars().all()
            
            personas = []
            for persona in personas_list:
                personas.append({
                    "name": persona.name,
                    "title": persona.title or persona.name
                })
            
            return sorted(personas, key=lambda x: x["name"])
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error listing personas from database: {e}", exc_info=True)
        return []


async def save_persona_config(persona_name: str, config: Dict[str, Any], session: Optional[AsyncSession] = None) -> bool:
    """Save a persona configuration to database.
    
    Args:
        persona_name: Name of the persona.
        config: Dictionary with persona configuration.
        session: Optional database session. If None, creates a new one.
    
    Returns:
        True if successful, False otherwise.
    """
    from database.base import AsyncSessionLocal
    from database.models import PersonaConfig
    
    try:
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            title = config.get("title", persona_name)
            
            result = await db_session.execute(
                select(PersonaConfig).where(PersonaConfig.name == persona_name)
            )
            persona = result.scalar_one_or_none()
            
            if persona:
                persona.title = title
                persona.config_data = config
            else:
                db_session.add(PersonaConfig(
                    name=persona_name,
                    title=title,
                    config_data=config,
                    is_active="false"
                ))
            
            if not session:  # Only commit if we created the session
                await db_session.commit()
            
            logger.info(f"Saved persona config: {persona_name}")
            return True
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error saving persona config {persona_name}: {e}", exc_info=True)
        if not session:
            try:
                await db_session.rollback()
            except:
                pass
        return False


async def create_persona_config(persona_name: str, config: Dict[str, Any], session: Optional[AsyncSession] = None) -> bool:
    """Create a new persona configuration in database.
    
    Args:
        persona_name: Name of the persona.
        config: Dictionary with persona configuration.
        session: Optional database session. If None, creates a new one.
    
    Returns:
        True if successful, False otherwise.
    """
    from database.base import AsyncSessionLocal
    from database.models import PersonaConfig
    
    try:
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            # Check if persona already exists
            result = await db_session.execute(
                select(PersonaConfig).where(PersonaConfig.name == persona_name)
            )
            if result.scalar_one_or_none():
                logger.warning(f"Persona {persona_name} already exists")
                return False
            
            title = config.get("title", persona_name)
            db_session.add(PersonaConfig(
                name=persona_name,
                title=title,
                config_data=config,
                is_active="false"
            ))
            
            if not session:  # Only commit if we created the session
                await db_session.commit()
            
            logger.info(f"Created persona config: {persona_name}")
            return True
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error creating persona config {persona_name}: {e}", exc_info=True)
        if not session:
            try:
                await db_session.rollback()
            except:
                pass
        return False


async def delete_persona_config(persona_name: str, session: Optional[AsyncSession] = None) -> bool:
    """Delete a persona configuration from database.
    
    Args:
        persona_name: Name of the persona to delete.
        session: Optional database session. If None, creates a new one.
    
    Returns:
        True if successful, False otherwise.
    """
    from database.base import AsyncSessionLocal
    from database.models import PersonaConfig
    from sqlalchemy import delete as sql_delete
    
    try:
        # Don't allow deleting 'default' persona
        if persona_name == 'default':
            logger.warning("Cannot delete default persona")
            return False
        
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            # Check if persona is currently active
            result = await db_session.execute(
                select(PersonaConfig).where(
                    PersonaConfig.name == persona_name,
                    PersonaConfig.is_active == "true"
                )
            )
            if result.scalar_one_or_none():
                logger.warning(f"Cannot delete active persona {persona_name}")
                return False
            
            # Delete the persona
            await db_session.execute(
                sql_delete(PersonaConfig).where(PersonaConfig.name == persona_name)
            )
            
            if not session:  # Only commit if we created the session
                await db_session.commit()
            
            logger.info(f"Deleted persona config: {persona_name}")
            return True
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error deleting persona config {persona_name}: {e}", exc_info=True)
        if not session:
            try:
                await db_session.rollback()
            except:
                pass
        return False
