"""Utilities for loading and managing persona configurations."""
import json
import logging
from typing import Dict, Any, Optional, List
from pathlib import Path
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
                # Fallback: check file
                return _get_current_persona_from_file()
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error getting current persona from database: {e}", exc_info=True)
        return _get_current_persona_from_file()


def _get_current_persona_from_file() -> str:
    """Fallback: Get current persona from file."""
    config_file = Path(__file__).parent / "current_persona.json"
    try:
        if config_file.exists():
            with open(config_file, 'r') as f:
                data = json.load(f)
                return data.get("persona", "default")
        return "default"
    except Exception:
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
                # Fallback: try loading from file
                return _load_persona_from_file(persona_name)
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error loading persona config {persona_name}: {e}", exc_info=True)
        return _load_persona_from_file(persona_name)


def _load_persona_from_file(persona_name: str) -> Optional[Dict[str, Any]]:
    """Fallback: Load persona config from file."""
    config_file = Path(__file__).parent / "personas" / f"{persona_name}.config"
    try:
        if config_file.exists():
            with open(config_file, 'r') as f:
                return json.load(f)
        return None
    except Exception as e:
        logger.error(f"Error loading persona config from file {persona_name}: {e}")
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
        return _list_personas_from_files()


def _list_personas_from_files() -> List[Dict[str, Any]]:
    """Fallback: List personas from files."""
    personas_dir = Path(__file__).parent / "personas"
    personas = []
    
    try:
        if personas_dir.exists():
            for config_file in personas_dir.glob("*.config"):
                persona_name = config_file.stem
                config = _load_persona_from_file(persona_name)
                if config:
                    personas.append({
                        "name": persona_name,
                        "title": config.get("title", persona_name)
                    })
    except Exception as e:
        logger.error(f"Error listing personas from files: {e}")
    
    return sorted(personas, key=lambda x: x["name"])


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
