"""Utilities for loading voice configurations from the voices table."""
import logging
from typing import Optional, Tuple
from sqlalchemy import select
from database.base import AsyncSessionLocal
from database.models import Voice

logger = logging.getLogger(__name__)


async def get_voice_for_persona(persona_name: str) -> Optional[Tuple[str, str]]:
    """
    Get voice configuration for a persona.
    First checks if persona has a linked voice (PersonaConfig.voice_id),
    then falls back to checking voices table by persona_name.
    Returns (voice_id, voice_engine) tuple or None if not found.
    
    Args:
        persona_name: Name of the persona (e.g., "cortana", "rick", "rick_computer", "holly")
    
    Returns:
        Tuple of (fish_audio_id, voice_engine) or None
    """
    try:
        from database.models import PersonaConfig
        async with AsyncSessionLocal() as session:
            # First, check if persona has a linked voice via PersonaConfig.voice_id
            persona_result = await session.execute(
                select(PersonaConfig).where(PersonaConfig.name == persona_name)
            )
            persona = persona_result.scalar_one_or_none()
            
            if persona and persona.voice_id:
                # Persona has a linked voice, get it
                voice_result = await session.execute(
                    select(Voice).where(Voice.id == persona.voice_id)
                )
                voice = voice_result.scalar_one_or_none()
                if voice:
                    logger.debug(f"Found linked voice for persona '{persona_name}': {voice.fish_audio_id}")
                    return (voice.fish_audio_id, voice.voice_engine or "s1")
            
            # Fallback: check voices table by persona_name
            result = await session.execute(
                select(Voice).where(Voice.persona_name == persona_name)
            )
            voice = result.scalar_one_or_none()
            
            if voice:
                logger.debug(f"Found voice in voices table for '{persona_name}': {voice.fish_audio_id}")
                return (voice.fish_audio_id, voice.voice_engine or "s1")
            else:
                logger.debug(f"No voice found for '{persona_name}'")
                return None
    except Exception as e:
        logger.error(f"Error loading voice for persona '{persona_name}': {e}", exc_info=True)
        return None


async def get_voice_id_for_persona(persona_name: str, fallback_to_config: bool = True) -> Optional[str]:
    """
    Get voice ID for a persona, checking voices table first, then falling back to persona config.
    
    Args:
        persona_name: Name of the persona
        fallback_to_config: If True, fall back to persona config if not in voices table
    
    Returns:
        Voice ID string or None
    """
    voice_config = await get_voice_for_persona(persona_name)
    if voice_config:
        return voice_config[0]
    
    # Fallback to persona config if enabled
    if fallback_to_config:
        try:
            from config.persona_loader import load_persona_config_by_name
            persona_config = await load_persona_config_by_name(persona_name)
            if persona_config and "fish_audio" in persona_config:
                voice_id = persona_config["fish_audio"].get("voice_id")
                if voice_id:
                    logger.debug(f"Found voice_id in persona config for '{persona_name}': {voice_id}")
                    return voice_id
        except Exception as e:
            logger.debug(f"Could not load persona config for '{persona_name}': {e}")
    
    return None
