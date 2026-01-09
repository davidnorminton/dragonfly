"""Utility functions for loading expert type configurations."""
import logging
from typing import Dict, Any, Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def load_expert_types(session: Optional[AsyncSession] = None) -> Dict[str, Dict[str, Any]]:
    """Load all expert type configurations from database.
    
    Args:
        session: Optional database session. If None, creates a new one.
    
    Returns:
        Dictionary mapping expert type IDs to their configurations.
    """
    from database.base import AsyncSessionLocal
    from database.models import ExpertTypesConfig
    
    try:
        if session:
            db_session = session
            should_close = False
        else:
            db_session = AsyncSessionLocal()
            should_close = True
        
        try:
            result = await db_session.execute(select(ExpertTypesConfig))
            expert_types_list = result.scalars().all()
            
            expert_types = {}
            for expert in expert_types_list:
                expert_types[expert.expert_type] = {
                    "name": expert.name,
                    "description": expert.description or "",
                    "system_prompt": expert.system_prompt,
                    "icon": expert.icon or "💬"
                }
                if expert.extra_data:
                    expert_types[expert.expert_type].update(expert.extra_data)
            
            logger.debug(f"Loaded {len(expert_types)} expert types from database")
            return expert_types
        finally:
            if should_close:
                await db_session.close()
    except Exception as e:
        logger.error(f"Error loading expert types from database: {e}", exc_info=True)
        return {}


async def get_expert_type(expert_type_id: str, session: Optional[AsyncSession] = None) -> Optional[Dict[str, Any]]:
    """Get a specific expert type configuration from database.
    
    Args:
        expert_type_id: The ID of the expert type to retrieve.
        session: Optional database session. If None, creates a new one.
    
    Returns:
        Dictionary with expert type configuration or None if not found.
    """
    expert_types = await load_expert_types(session)
    return expert_types.get(expert_type_id)


async def list_expert_types(session: Optional[AsyncSession] = None) -> List[Dict[str, Any]]:
    """List all available expert types from database.
    
    Args:
        session: Optional database session. If None, creates a new one.
    
    Returns:
        List of dictionaries with expert type information.
    """
    expert_types = await load_expert_types(session)
    return [
        {
            "id": expert_id,
            "name": config.get("name", expert_id),
            "description": config.get("description", ""),
            "icon": config.get("icon", "💬")
        }
        for expert_id, config in expert_types.items()
    ]
