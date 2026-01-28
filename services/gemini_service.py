"""Google Gemini AI service."""
import os
from services.base_service import BaseService
from typing import Dict, Any, Optional, List, AsyncGenerator
import google.generativeai as genai
from config.settings import settings
from config.persona_loader import load_persona_config, get_current_persona_name
from config.api_key_loader import load_api_keys
from database.base import AsyncSessionLocal
from database.models import ChatMessage
from sqlalchemy import select, desc
import asyncio
import logging

logger = logging.getLogger(__name__)


class GeminiService(BaseService):
    """Service for handling AI questions using Google Gemini API."""
    
    def __init__(self):
        super().__init__("gemini_service")
        self.client = None
        self.model = None
        self.persona_config = None
        self._api_key_loaded = False
    
    async def _load_api_key(self):
        """Load API key from database or environment."""
        if self._api_key_loaded:
            return
            
        api_key = None
        
        # Try to load from database
        try:
            api_keys_config = await load_api_keys()
            api_key = api_keys_config.get("google_gemini", {}).get("api_key")
            if api_key:
                self.logger.info("Loaded Google Gemini API key from database")
        except Exception as e:
            self.logger.warning(f"Could not load API key from database: {e}")
        
        # Fallback to environment variable
        if not api_key:
            api_key = os.getenv("GOOGLE_GEMINI_API_KEY")
            if api_key:
                self.logger.info("Loaded Google Gemini API key from environment")
        
        if api_key:
            genai.configure(api_key=api_key)
            # Default to gemini-pro model, can be overridden
            self.model = genai.GenerativeModel('gemini-pro')
            self._api_key_loaded = True
        else:
            self.logger.warning("No Google Gemini API key found. Gemini service will not work.")
    
    async def _load_persona_config(self):
        """Load the current persona configuration from database."""
        try:
            self.persona_config = await load_persona_config()
            if self.persona_config:
                persona_name = await get_current_persona_name()
                self.logger.info(f"Loaded persona config: {persona_name}")
            else:
                self.logger.warning("No persona config found, using defaults")
        except Exception as e:
            self.logger.error(f"Error loading persona config: {e}")
            self.persona_config = None
    
    async def _ensure_persona_config(self):
        """Ensure persona config is loaded."""
        if self.persona_config is None:
            await self._load_persona_config()
    
    async def _load_conversation_history(self, session_id: str, limit: int = 50) -> List[Dict[str, str]]:
        """Load conversation history for a session."""
        if not session_id:
            return []
            
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(ChatMessage)
                    .where(ChatMessage.session_id == session_id)
                    .order_by(desc(ChatMessage.created_at))
                    .limit(limit)
                )
                messages = result.scalars().all()
                
                # Convert to format expected by Gemini
                history = []
                for msg in reversed(messages):  # Reverse to get chronological order
                    role = "user" if msg.role == "user" else "model"
                    history.append({
                        "role": role,
                        "parts": [msg.message]
                    })
                
                return history
        except Exception as e:
            self.logger.error(f"Error loading conversation history: {e}")
            return []
    
    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute Gemini service with given input data.
        
        Expected input:
            - question: str - The question to ask
            - session_id: str (optional) - Session ID for conversation history
            - user_id: int (optional) - User ID for personalization
            - custom_context: str (optional) - Custom system context
            - max_tokens: int (optional) - Max tokens for response
        
        Returns:
            Dict with answer, question, service, and model
        """
        await self._load_api_key()
        await self._ensure_persona_config()
        self.validate_input(input_data, ["question"])
        
        question = input_data["question"]
        
        if not self.model:
            return {
                "answer": "Google Gemini service is not configured. Please add your Google Gemini API key in Settings > API Keys.",
                "question": question,
                "service": "gemini_service",
                "error": "API key not configured"
            }
        
        try:
            self.logger.info(f"Processing Gemini question: {question}")
            
            # Load conversation history if session_id provided
            session_id = input_data.get("session_id")
            conversation_history = []
            if session_id:
                conversation_history = await self._load_conversation_history(session_id)
            
            # Get custom context or build system prompt
            custom_context = input_data.get("custom_context")
            system_instruction = None
            
            if custom_context and custom_context.strip():
                system_instruction = custom_context.strip()
            elif self.persona_config and "gemini" in self.persona_config:
                gemini_cfg = self.persona_config["gemini"]
                system_instruction = gemini_cfg.get("system_instruction") or gemini_cfg.get("prompt_context")
            
            # Build messages for Gemini
            # Gemini uses a different format: history + current question
            chat = self.model.start_chat(history=conversation_history)
            
            # Configure generation config
            generation_config = {}
            max_tokens = input_data.get("max_tokens")
            if max_tokens:
                generation_config["max_output_tokens"] = max_tokens
            
            if self.persona_config and "gemini" in self.persona_config:
                gemini_cfg = self.persona_config["gemini"]
                if gemini_cfg.get("temperature") is not None:
                    generation_config["temperature"] = gemini_cfg.get("temperature")
                if gemini_cfg.get("top_p") is not None:
                    generation_config["top_p"] = gemini_cfg.get("top_p")
            
            # Send message with system instruction if available
            if system_instruction:
                # Gemini doesn't have a separate system parameter, so we prepend it to the first message
                full_question = f"{system_instruction}\n\n{question}"
            else:
                full_question = question
            
            # Generate response
            response = await asyncio.to_thread(
                chat.send_message,
                full_question,
                generation_config=generation_config if generation_config else None
            )
            
            answer = response.text if hasattr(response, 'text') else str(response)
            
            self.logger.info(f"Gemini response generated (length: {len(answer)})")
            
            return {
                "answer": answer,
                "question": question,
                "service": "gemini_service",
                "model": "gemini-pro"
            }
            
        except Exception as e:
            self.logger.error(f"Error calling Google Gemini API: {e}", exc_info=True)
            return {
                "answer": f"Error: {str(e)}",
                "question": question,
                "service": "gemini_service",
                "error": str(e)
            }
    
    async def stream_execute(self, input_data: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """
        Execute Gemini service with streaming response (async generator).
        
        Expected input:
            - question: str - The question to ask
            - session_id: str (optional) - Session ID for conversation history
            - custom_context: str (optional) - Custom system context
        
        Yields:
            - str - Chunks of the AI's response
        """
        await self._load_api_key()
        await self._ensure_persona_config()
        self.validate_input(input_data, ["question"])
        
        question = input_data["question"]
        
        if not self.model:
            yield "Google Gemini service is not configured. Please add your Google Gemini API key in Settings."
            return
        
        try:
            self.logger.info(f"Processing Gemini question with streaming: {question}")
            
            # Load conversation history if session_id provided
            session_id = input_data.get("session_id")
            conversation_history = []
            if session_id:
                conversation_history = await self._load_conversation_history(session_id)
            
            # Get custom context
            custom_context = input_data.get("custom_context")
            system_instruction = None
            
            if custom_context and custom_context.strip():
                system_instruction = custom_context.strip()
            elif self.persona_config and "gemini" in self.persona_config:
                gemini_cfg = self.persona_config["gemini"]
                system_instruction = gemini_cfg.get("system_instruction") or gemini_cfg.get("prompt_context")
            
            # Build messages for Gemini
            chat = self.model.start_chat(history=conversation_history)
            
            # Configure generation config
            generation_config = {}
            max_tokens = input_data.get("max_tokens")
            if max_tokens:
                generation_config["max_output_tokens"] = max_tokens
            
            if self.persona_config and "gemini" in self.persona_config:
                gemini_cfg = self.persona_config["gemini"]
                if gemini_cfg.get("temperature") is not None:
                    generation_config["temperature"] = gemini_cfg.get("temperature")
                if gemini_cfg.get("top_p") is not None:
                    generation_config["top_p"] = gemini_cfg.get("top_p")
            
            # Prepare question with system instruction
            if system_instruction:
                full_question = f"{system_instruction}\n\n{question}"
            else:
                full_question = question
            
            # Stream response
            response = await asyncio.to_thread(
                chat.send_message,
                full_question,
                generation_config=generation_config if generation_config else None,
                stream=True
            )
            
            # Yield chunks as they arrive
            for chunk in response:
                if hasattr(chunk, 'text') and chunk.text:
                    yield chunk.text
                elif hasattr(chunk, 'parts'):
                    for part in chunk.parts:
                        if hasattr(part, 'text') and part.text:
                            yield part.text
            
        except Exception as e:
            self.logger.error(f"Error calling Google Gemini API (streaming): {e}", exc_info=True)
            yield f"Error: {str(e)}"
