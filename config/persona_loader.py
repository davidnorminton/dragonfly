"""Utilities for loading and managing persona configurations."""
import json
import os
from typing import Dict, Any, Optional
from pathlib import Path


def get_personas_directory() -> Path:
    """Get the path to the personas directory."""
    return Path(__file__).parent / "personas"


def get_current_persona_name() -> str:
    """Get the name of the currently selected persona."""
    config_file = Path(__file__).parent / "current_persona.json"
    try:
        if config_file.exists():
            with open(config_file, 'r') as f:
                data = json.load(f)
                return data.get("persona", "default")
        return "default"
    except Exception:
        return "default"


def set_current_persona(persona_name: str) -> bool:
    """Set the current persona. Returns True if successful."""
    config_file = Path(__file__).parent / "current_persona.json"
    try:
        with open(config_file, 'w') as f:
            json.dump({"persona": persona_name}, f, indent=2)
        return True
    except Exception as e:
        print(f"Error setting persona: {e}")
        return False


def load_persona_config(persona_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Load a persona configuration file.
    
    Args:
        persona_name: Name of the persona to load (without .config extension).
                     If None, loads the current persona.
    
    Returns:
        Dictionary with persona configuration or None if not found.
    """
    if persona_name is None:
        persona_name = get_current_persona_name()
    
    config_file = get_personas_directory() / f"{persona_name}.config"
    
    try:
        if config_file.exists():
            with open(config_file, 'r') as f:
                return json.load(f)
        return None
    except Exception as e:
        print(f"Error loading persona config {persona_name}: {e}")
        return None


def list_available_personas() -> list:
    """List all available persona configuration files."""
    personas_dir = get_personas_directory()
    personas = []
    
    try:
        if personas_dir.exists():
            for config_file in personas_dir.glob("*.config"):
                persona_name = config_file.stem
                config = load_persona_config(persona_name)
                if config:
                    personas.append({
                        "name": persona_name,
                        "title": config.get("title", persona_name)
                    })
    except Exception as e:
        print(f"Error listing personas: {e}")
    
    return sorted(personas, key=lambda x: x["name"])


def save_persona_config(persona_name: str, config: Dict[str, Any]) -> bool:
    """Save a persona configuration file.
    
    Args:
        persona_name: Name of the persona (without .config extension).
        config: Dictionary with persona configuration.
    
    Returns:
        True if successful, False otherwise.
    """
    config_file = get_personas_directory() / f"{persona_name}.config"
    
    try:
        # Ensure the personas directory exists
        config_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving persona config {persona_name}: {e}")
        return False


def create_persona_config(persona_name: str, config: Dict[str, Any]) -> bool:
    """Create a new persona configuration file.
    
    Args:
        persona_name: Name of the persona (without .config extension).
        config: Dictionary with persona configuration.
    
    Returns:
        True if successful, False otherwise.
    """
    config_file = get_personas_directory() / f"{persona_name}.config"
    
    # Check if persona already exists
    if config_file.exists():
        return False
    
    return save_persona_config(persona_name, config)

