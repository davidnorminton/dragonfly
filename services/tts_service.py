"""Text-to-Speech service using Fish Audio API SDK."""
import json
import asyncio
from typing import Optional
import logging
from pathlib import Path
from datetime import datetime
from fish_audio_sdk import AsyncWebSocketSession, TTSRequest
from utils.text_cleaner import clean_text_for_tts

logger = logging.getLogger(__name__)


class TTSService:
    """Service for converting text to speech using Fish Audio API SDK."""
    
    def __init__(self):
        self.fish_api_key = None
        self._load_api_key()
    
    def _load_api_key(self):
        """Load Fish Audio API key from config file."""
        try:
            from config.settings import settings
            import os
            api_keys_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), settings.api_keys_file)
            if os.path.exists(api_keys_path):
                with open(api_keys_path, 'r') as f:
                    api_keys = json.load(f)
                    self.fish_api_key = api_keys.get("fish_audio", {}).get("api_key")
                    if self.fish_api_key:
                        logger.info("Fish Audio API key loaded")
                    else:
                        logger.warning("Fish Audio API key not found in config")
        except Exception as e:
            logger.error(f"Error loading Fish Audio API key: {e}")
    
    def _get_audio_directory(self) -> Path:
        """Get the path to the audio directory."""
        return Path(__file__).parent.parent / "data" / "audio"
    
    async def generate_audio(self, text: str, voice_id: str, voice_engine: str = "s1", save_to_file: bool = True) -> tuple[Optional[bytes], Optional[str]]:
        """
        Generate audio from text using Fish Audio API SDK.
        
        Args:
            text: Text to convert to speech
            voice_id: Voice ID (reference_id) from persona config
            voice_engine: Voice engine/backend (default: "s1")
            save_to_file: Whether to save the audio file
        
        Returns:
            Tuple of (audio bytes or None, filepath or None if error)
        """
        if not self.fish_api_key:
            logger.error("Fish Audio API key not configured")
            return (None, None)
        
        try:
            # Clean the text before sending to TTS
            cleaned_text = clean_text_for_tts(text)
            logger.info(f"Generating audio with Fish Audio SDK (voice_id: {voice_id}, backend: {voice_engine})")
            
            # Create session
            async with AsyncWebSocketSession(apikey=self.fish_api_key) as session:
                # Create TTS request without text (text will come from text_stream only)
                request = TTSRequest(
                    text="",  # Empty - text comes only from text_stream
                    reference_id=voice_id,
                    format="mp3"
                )
                
                # Create async generator that yields the text once
                async def text_stream():
                    yield cleaned_text
                
                # Generate audio (returns async generator of bytes)
                # Use text_stream only, not the text parameter, to avoid duplication
                audio_data = bytearray()
                async for audio_chunk in session.tts(request, text_stream(), backend=voice_engine):
                    audio_data.extend(audio_chunk)
                
                if audio_data:
                    audio_bytes = bytes(audio_data)
                    logger.info(f"Generated audio: {len(audio_bytes)} bytes")
                    
                    # Save to file if requested
                    filepath = None
                    if save_to_file:
                        try:
                            audio_dir = self._get_audio_directory()
                            audio_dir.mkdir(parents=True, exist_ok=True)
                            
                            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                            filename = f"tts_{timestamp}.mp3"
                            filepath = audio_dir / filename
                            
                            with open(filepath, 'wb') as f:
                                f.write(audio_bytes)
                            
                            logger.info(f"Saved audio file: {filepath}")
                        except Exception as e:
                            logger.warning(f"Failed to save audio file: {e}")
                    
                    # Return relative path for storage
                    relative_path = None
                    if filepath:
                        # Get relative path from project root
                        project_root = Path(__file__).parent.parent
                        try:
                            relative_path = str(filepath.relative_to(project_root))
                        except ValueError:
                            # If relative_to fails, use absolute path
                            relative_path = str(filepath)
                    
                    return (audio_bytes, relative_path)
                else:
                    logger.warning("No audio data received from Fish Audio API")
                    return (None, None)
                    
        except Exception as e:
            logger.error(f"Error generating audio with Fish Audio SDK: {e}", exc_info=True)
            return (None, None)
