"""Utility functions for loading expert type configurations."""
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

EXPERT_TYPES_CONFIG_PATH = Path(__file__).parent / "expert_types.json"


def load_expert_types() -> Dict[str, Dict[str, Any]]:
    """Load all expert type configurations."""
    try:
        if not EXPERT_TYPES_CONFIG_PATH.exists():
            logger.warning(f"Expert types config file not found at {EXPERT_TYPES_CONFIG_PATH}")
            return {}
        
        with open(EXPERT_TYPES_CONFIG_PATH, 'r', encoding='utf-8') as f:
            config = json.load(f)
            logger.debug("Loaded expert types config")
            return config
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Error loading expert types config: {e}", exc_info=True)
        return {}


def get_expert_type(expert_type_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific expert type configuration."""
    expert_types = load_expert_types()
    return expert_types.get(expert_type_id)


def list_expert_types() -> list:
    """List all available expert types."""
    expert_types = load_expert_types()
    return [
        {
            "id": expert_id,
            "name": config.get("name", expert_id),
            "description": config.get("description", ""),
            "icon": config.get("icon", "💬")
        }
        for expert_id, config in expert_types.items()
    ]

