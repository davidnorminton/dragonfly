"""AI service for general questions using Anthropic Claude API."""
import os
from services.base_service import BaseService
from typing import Dict, Any, Optional, List
import anthropic
from anthropic import AsyncAnthropic
from config.settings import settings
from config.persona_loader import load_persona_config, get_current_persona_name
from config.api_key_loader import load_api_keys
from database.base import AsyncSessionLocal
from database.models import ChatMessage
from sqlalchemy import select, desc
import asyncio


class AIService(BaseService):
    """Service for handling general AI questions using Anthropic Claude."""
    
    def __init__(self):
        super().__init__("ai_service")
        self.client = None
        self.async_client = None
        self.persona_config = None
        # API key will be loaded async on first use
        self._api_key_loaded = False
    
    async def _load_api_key(self):
        """Load API key from database or environment."""
        if self._api_key_loaded:
            return
            
        api_key = settings.ai_api_key
        
        # Try to load from database
        if not api_key:
            try:
                api_keys_config = await load_api_keys()
                api_key = api_keys_config.get("anthropic", {}).get("api_key")
                if api_key:
                    self.logger.info("Loaded Anthropic API key from database")
            except Exception as e:
                self.logger.warning(f"Could not load API key from database: {e}")
        
        # Fallback to environment variable
        if not api_key:
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if api_key:
                self.logger.info("Loaded Anthropic API key from environment")
        
        if api_key:
            self.client = anthropic.Anthropic(api_key=api_key)
            self.async_client = AsyncAnthropic(api_key=api_key)
            self._api_key_loaded = True
        else:
            self.logger.warning("No Anthropic API key found. AI service will return placeholder responses.")
    
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
    
    async def reload_persona_config(self):
        """Reload the persona configuration (useful when persona is changed)."""
        await self._load_persona_config()
    
    async def _ensure_persona_config(self):
        """Ensure persona config is loaded."""
        if self.persona_config is None:
            await self._load_persona_config()
    
    async def _load_conversation_history(self, session_id: str, limit: int = 50) -> List[Dict[str, str]]:
        """
        Load conversation history for a session with prioritized recent messages.
        Provides context for maintaining conversation continuity.
        """
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(ChatMessage)
                    .where(ChatMessage.session_id == session_id)
                    .order_by(desc(ChatMessage.created_at))
                    .limit(limit)
                )
                messages = result.scalars().all()
                
                # Convert to list of message dicts, reverse to get chronological order
                history = []
                for msg in reversed(messages):
                    if msg.role in ["user", "assistant"]:
                        history.append({
                            "role": msg.role,
                            "content": msg.message
                        })
                
                self.logger.debug(f"Loaded {len(history)} messages from conversation history for session {session_id}")
                return history
        except Exception as e:
            self.logger.error(f"Error loading conversation history: {e}", exc_info=True)
            return []
    
    async def execute_with_system_prompt(self, question: str, system_prompt: str, max_tokens: int = 1024) -> Dict[str, Any]:
        """
        Execute AI query with a custom system prompt, bypassing persona configuration.
        Useful for API-style tasks that need specific formatting (like JSON responses).
        
        Args:
            question: The user's question/prompt
            system_prompt: Custom system prompt to use
            max_tokens: Maximum tokens for response (default 1024)
        
        Returns:
            Dict with 'answer' and other metadata
        """
        await self._load_api_key()
        
        if not self.async_client:
            return {
                "answer": "AI service is not configured. Please add your Anthropic API key in Settings.",
                "question": question,
                "service": "ai_service",
                "error": "no_api_key"
            }
        
        try:
            self.logger.info(f"Processing AI question with custom system prompt: {question[:100]}...")
            
            message = await self.async_client.messages.create(
                model=settings.ai_model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{
                    "role": "user",
                    "content": question
                }]
            )
            
            # Extract the response text
            answer = ""
            if message.content:
                for content_block in message.content:
                    if content_block.type == "text":
                        answer += content_block.text
            
            self.logger.info(f"AI response generated (length: {len(answer)})")
            
            return {
                "answer": answer,
                "question": question,
                "service": "ai_service",
                "model": settings.ai_model
            }
            
        except Exception as e:
            self.logger.error(f"Error calling Anthropic API: {e}", exc_info=True)
            return {
                "answer": f"Error: {str(e)}",
                "question": question,
                "service": "ai_service",
                "error": str(e)
            }
    
    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute AI service.
        
        Expected input:
            - question: str - The question to ask
            - session_id: str (optional) - Session ID to load conversation history
            - messages: List[Dict] (optional) - Pre-loaded conversation history
        
        Returns:
            - answer: str - The AI's response
        """
        await self._load_api_key()
        await self._ensure_persona_config()
        self.validate_input(input_data, ["question"])
        
        question = input_data["question"]
        session_id = input_data.get("session_id")
        conversation_history = input_data.get("messages", [])
        
        if not self.client:
            return {
                "answer": "AI service is not configured. Please add your Anthropic API key in Settings.",
                "question": question,
                "service": "ai_service",
                "error": "no_api_key"
            }
        
        try:
            self.logger.info(f"Processing AI question: {question}")
            
            # Use Claude API (async client)
            if not self.async_client:
                return {
                    "answer": "AI service is not configured. Please add your Anthropic API key in Settings.",
                    "question": question,
                    "service": "ai_service",
                    "error": "no_api_key"
                }
            
            # Load conversation history if session_id provided and no messages passed
            if session_id and not conversation_history:
                conversation_history = await self._load_conversation_history(session_id, limit=50)
            
            # Get persona settings or use defaults
            persona_settings = {}
            system_prompt = None
            if self.persona_config and "anthropic" in self.persona_config:
                anthropic_cfg = self.persona_config["anthropic"]
                persona_settings = {
                    "model": anthropic_cfg.get("anthropic_model", settings.ai_model),
                    "max_tokens": anthropic_cfg.get("max_tokens", 1024),
                    "temperature": anthropic_cfg.get("temperature"),
                    "top_p": anthropic_cfg.get("top_p"),
                }
                # Filter out None values
                persona_settings = {k: v for k, v in persona_settings.items() if v is not None}
                
                # Get system prompt if present (Anthropic uses top-level system parameter, not message role)
                system_prompt = anthropic_cfg.get("prompt_context")
            else:
                # Default behavior without persona
                persona_settings = {
                    "model": settings.ai_model,
                    "max_tokens": 1024
                }
            
            # Build messages array with conversation history + current question
            messages = conversation_history.copy() if conversation_history else []
            messages.append({
                "role": "user",
                "content": question
            })
            
            # Add system parameter if we have a system prompt
            if system_prompt:
                persona_settings["system"] = system_prompt
            
            self.logger.debug(f"Sending {len(messages)} messages to Claude API (including {len(conversation_history)} from history)")
            
            message = await self.async_client.messages.create(
                messages=messages,
                **persona_settings
            )
            
            # Extract the response text
            answer = ""
            if message.content:
                for content_block in message.content:
                    if content_block.type == "text":
                        answer += content_block.text
            
            self.logger.info(f"AI response generated (length: {len(answer)})")
            
            return {
                "answer": answer,
                "question": question,
                "service": "ai_service",
                "model": settings.ai_model
            }
            
        except Exception as e:
            self.logger.error(f"Error calling Anthropic API: {e}", exc_info=True)
            return {
                "answer": f"Error: {str(e)}",
                "question": question,
                "service": "ai_service",
                "error": str(e)
            }
    
    async def stream_execute(self, input_data: Dict[str, Any]):
        """
        Execute AI service with streaming response (async generator).
        
        Expected input:
            - question: str - The question to ask
        
        Yields:
            - str - Chunks of the AI's response
        """
        await self._load_api_key()
        await self._ensure_persona_config()
        self.validate_input(input_data, ["question"])
        
        question = input_data["question"]
        
        if not self.client:
            yield "AI service is not configured. Please add your Anthropic API key in Settings."
            return
        
        try:
            self.logger.info(f"Processing AI question with streaming: {question}")
            
            # Load conversation history if session_id provided
            session_id = input_data.get("session_id")
            conversation_history = input_data.get("messages", [])
            if session_id and not conversation_history:
                conversation_history = await self._load_conversation_history(session_id, limit=50)
            
            # Get persona settings or use defaults
            persona_settings = {}
            system_prompt = None
            if self.persona_config and "anthropic" in self.persona_config:
                anthropic_cfg = self.persona_config["anthropic"]
                persona_settings = {
                    "model": anthropic_cfg.get("anthropic_model", settings.ai_model),
                    "max_tokens": anthropic_cfg.get("max_tokens", 1024),
                    "temperature": anthropic_cfg.get("temperature"),
                    "top_p": anthropic_cfg.get("top_p"),
                }
                # Filter out None values
                persona_settings = {k: v for k, v in persona_settings.items() if v is not None}
                
                # Get system prompt if present (Anthropic uses top-level system parameter, not message role)
                system_prompt = anthropic_cfg.get("prompt_context")
            else:
                # Default behavior without persona
                persona_settings = {
                    "model": settings.ai_model,
                    "max_tokens": 1024
                }
            
            # Build messages array with conversation history + current question
            messages = conversation_history.copy() if conversation_history else []
            messages.append({
                "role": "user",
                "content": question
            })
            
            # Add system parameter if we have a system prompt
            if system_prompt:
                persona_settings["system"] = system_prompt
            
            self.logger.debug(f"Sending {len(messages)} messages to Claude API (including {len(conversation_history)} from history)")
            
            # Stream response from Claude API (synchronous iterator)
            with self.client.messages.stream(
                messages=messages,
                **persona_settings
            ) as stream:
                for text in stream.text_stream:
                    yield text
                    
        except Exception as e:
            self.logger.error(f"Error calling Anthropic API: {e}", exc_info=True)
            yield f"Error: {str(e)}"
    
    async def async_stream_execute(self, input_data: Dict[str, Any]):
        """
        Execute AI service with streaming response (async generator).
        
        Expected input:
            - question: str - The question to ask
            - session_id: str (optional) - Session ID to load conversation history
            - messages: List[Dict] (optional) - Pre-loaded conversation history
        
        Yields:
            - str - Chunks of the AI's response
        """
        await self._load_api_key()
        await self._ensure_persona_config()
        self.validate_input(input_data, ["question"])
        
        question = input_data["question"]
        session_id = input_data.get("session_id")
        conversation_history = input_data.get("messages", [])
        
        if not self.async_client:
            yield "AI service is not configured. Please add your Anthropic API key in Settings."
            return
        
        try:
            self.logger.info(f"Processing AI question with async streaming: {question}")
            
            # Load conversation history if session_id provided and no messages passed
            if session_id and not conversation_history:
                conversation_history = await self._load_conversation_history(session_id, limit=50)
            
            # Get persona settings or use defaults
            persona_settings = {}
            system_prompt = None
            if self.persona_config and "anthropic" in self.persona_config:
                anthropic_cfg = self.persona_config["anthropic"]
                persona_settings = {
                    "model": anthropic_cfg.get("anthropic_model", settings.ai_model),
                    "max_tokens": anthropic_cfg.get("max_tokens", 1024),
                    "temperature": anthropic_cfg.get("temperature"),
                    "top_p": anthropic_cfg.get("top_p"),
                }
                # Filter out None values
                persona_settings = {k: v for k, v in persona_settings.items() if v is not None}
                
                # Get system prompt if present
                system_prompt = anthropic_cfg.get("prompt_context")
            else:
                persona_settings = {
                    "model": settings.ai_model,
                    "max_tokens": 1024
                }
            
            # Override with preset values if provided
            if input_data.get("system_prompt"):
                system_prompt = input_data["system_prompt"]
            if input_data.get("temperature") is not None:
                persona_settings["temperature"] = input_data["temperature"]
            if input_data.get("top_p") is not None:
                persona_settings["top_p"] = input_data["top_p"]
            
            # Override with model if provided (user selection takes precedence)
            if input_data.get("model"):
                persona_settings["model"] = input_data["model"]
                self.logger.info(f"Using model override: {input_data['model']}")
                
                # Adjust max_tokens based on model if needed
                # Newer models support higher token counts
                if "claude-4" in input_data["model"] or "claude-3-7" in input_data["model"]:
                    # Claude 4 models support up to 64k output tokens
                    if persona_settings.get("max_tokens", 1024) < 4096:
                        persona_settings["max_tokens"] = 4096
                elif "haiku" in input_data["model"]:
                    # Haiku models are optimized for speed, use reasonable token limit
                    if persona_settings.get("max_tokens", 1024) > 4096:
                        persona_settings["max_tokens"] = 4096
            
            # Some newer models don't allow both temperature and top_p
            # If both are set, prefer temperature and remove top_p
            if persona_settings.get("temperature") is not None and persona_settings.get("top_p") is not None:
                model_name = persona_settings.get("model", "").lower()
                # Claude 4.5 and newer models don't support both parameters
                # Check for any 4.5 or 4-5 variants (sonnet, haiku, opus)
                if any(pattern in model_name for pattern in [
                    "4.5", "4-5",  # Catch any 4.5 version notation
                    "sonnet-4", "haiku-4", "opus-4"  # Catch claude-sonnet-4-5-* variants
                ]):
                    self.logger.info(f"Removing top_p for {persona_settings['model']} (only temperature or top_p allowed)")
                    del persona_settings["top_p"]
            
            # Build messages array with conversation history + current question
            messages = conversation_history.copy() if conversation_history else []
            messages.append({
                "role": "user",
                "content": question
            })
            
            # Add system parameter if we have a system prompt
            if system_prompt:
                persona_settings["system"] = system_prompt
            
            # Sanitize parameters - ensure all values are proper types
            sanitized_settings = {}
            for key, value in persona_settings.items():
                if value is not None and value != "":
                    # Ensure numeric parameters are actually numbers
                    if key in ["max_tokens", "temperature", "top_p"]:
                        try:
                            if key == "max_tokens":
                                sanitized_settings[key] = int(value)
                            else:
                                sanitized_settings[key] = float(value)
                        except (ValueError, TypeError):
                            self.logger.warning(f"Invalid {key} value: {value}, skipping")
                            continue
                    else:
                        sanitized_settings[key] = value
            
            # Log the parameters being sent (excluding the actual messages content)
            log_params = {k: v for k, v in sanitized_settings.items() if k != "system"}
            self.logger.info(f"API parameters: {log_params}")
            if system_prompt:
                self.logger.debug(f"System prompt length: {len(system_prompt)} chars")
            self.logger.debug(f"Sending {len(messages)} messages to Claude API (including {len(conversation_history)} from history)")
            
            # Stream response from Claude API (async iterator)
            async with self.async_client.messages.stream(
                messages=messages,
                **sanitized_settings
            ) as stream:
                async for text in stream.text_stream:
                    yield text
                    
        except Exception as e:
            self.logger.error(f"Error calling Anthropic API: {e}", exc_info=True)
            yield f"Error: {str(e)}"
