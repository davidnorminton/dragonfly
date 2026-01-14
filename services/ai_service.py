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
    
    async def _get_user_name(self, user_id: Optional[int] = None) -> Optional[str]:
        """Get user name from database using user_id."""
        if not user_id:
            return None
        
        try:
            from database.models import User
            async with AsyncSessionLocal() as session:
                from sqlalchemy import select
                result = await session.execute(
                    select(User).where(User.id == user_id)
                )
                user = result.scalar_one_or_none()
                if user:
                    return user.name
        except Exception as e:
            self.logger.warning(f"Could not get user name for user_id {user_id}: {e}")
        return None
    
    async def _get_system_pre_context_prompt(self, user_id: Optional[int] = None) -> Optional[str]:
        """Get pre-context prompt from system config and replace user name placeholder."""
        try:
            from database.models import SystemConfig
            async with AsyncSessionLocal() as session:
                from sqlalchemy import select
                result = await session.execute(
                    select(SystemConfig).where(SystemConfig.config_key == "pre_context_prompt")
                )
                system_config = result.scalar_one_or_none()
                if system_config and system_config.config_value:
                    pre_context_prompt = system_config.config_value
                    # Handle both string and dict formats (JSON column can store either)
                    if isinstance(pre_context_prompt, dict):
                        pre_context_prompt = pre_context_prompt.get("pre_context_prompt") or pre_context_prompt.get("value") or ""
                    if isinstance(pre_context_prompt, str) and pre_context_prompt.strip():
                        self.logger.info(f"Found pre-context prompt (length: {len(pre_context_prompt)}), user_id: {user_id}")
                        if user_id:
                            # Get user name and replace placeholder
                            user_name = await self._get_user_name(user_id)
                            self.logger.info(f"Retrieved user name for user_id {user_id}: {user_name}")
                            if user_name:
                                result = pre_context_prompt.replace("{user_name}", user_name)
                                self.logger.info(f"Pre-context prompt with user name: {result[:100]}...")
                                return result
                            else:
                                self.logger.warning(f"User name not found for user_id {user_id}, using 'the user'")
                                return pre_context_prompt.replace("{user_name}", "the user")
                        else:
                            self.logger.debug("No user_id provided, using 'the user'")
                            return pre_context_prompt.replace("{user_name}", "the user")
                    else:
                        self.logger.info("Pre-context prompt exists but is not a valid string")
                else:
                    if system_config:
                        self.logger.info("No pre-context prompt found in system config (system_config exists but config_value is empty)")
                    else:
                        self.logger.info("No pre-context prompt SystemConfig entry found in database")
        except Exception as e:
            self.logger.warning(f"Could not get pre-context prompt from system config: {e}", exc_info=True)
        return None
    
    async def _get_system_max_tokens(self) -> Optional[int]:
        """Get max_tokens from system config."""
        try:
            from database.models import SystemConfig
            async with AsyncSessionLocal() as session:
                from sqlalchemy import select
                result = await session.execute(
                    select(SystemConfig).where(SystemConfig.config_key == "max_tokens")
                )
                system_config = result.scalar_one_or_none()
                if system_config and system_config.config_value is not None:
                    max_tokens = system_config.config_value
                    # Handle both int and string formats
                    if isinstance(max_tokens, (int, float)):
                        max_tokens_int = int(max_tokens)
                        if max_tokens_int > 0:
                            self.logger.info(f"Found max_tokens in system config: {max_tokens_int}")
                            return max_tokens_int
                    elif isinstance(max_tokens, str):
                        try:
                            max_tokens_int = int(max_tokens)
                            if max_tokens_int > 0:
                                self.logger.info(f"Found max_tokens in system config: {max_tokens_int}")
                                return max_tokens_int
                        except (ValueError, TypeError):
                            pass
        except Exception as e:
            self.logger.warning(f"Could not get max_tokens from system config: {e}", exc_info=True)
        return None
    
    async def _build_system_prompt_with_pre_context(self, user_id: Optional[int] = None, is_ai_focus_mode: bool = False) -> Optional[str]:
        """Build system prompt including pre-context prompt with user name.
        
        Args:
            user_id: Optional user ID for user name replacement
            is_ai_focus_mode: If True, adds instruction to keep answers to 80 words or less
        """
        system_prompt_parts = []
        
        # Get pre-context prompt from system config with user name
        pre_context_prompt = await self._get_system_pre_context_prompt(user_id)
        if pre_context_prompt:
            self.logger.info(f"✅ Pre-context prompt retrieved and added to system prompt (length: {len(pre_context_prompt)})")
            system_prompt_parts.append(pre_context_prompt)
        else:
            self.logger.debug("No pre-context prompt to add")
        
        # Get persona system prompt
        if self.persona_config and "anthropic" in self.persona_config:
            persona_prompt = self.persona_config["anthropic"].get("prompt_context")
            if persona_prompt:
                system_prompt_parts.append(persona_prompt)
        
        # Add AI focus mode specific instruction
        if is_ai_focus_mode:
            ai_focus_instruction = "Keep your answers concise and to the point, limiting responses to 80 words or less."
            system_prompt_parts.append(ai_focus_instruction)
            self.logger.info("✅ Added AI focus mode instruction: keep answers to 80 words or less")
        
        result = "\n\n".join(system_prompt_parts) if system_prompt_parts else None
        if result:
            self.logger.info(f"✅ Final system prompt built with {len(system_prompt_parts)} part(s), total length: {len(result)}")
        return result
    
    async def _load_conversation_history(self, session_id: str, limit: int = 50) -> List[Dict[str, str]]:
        """
        Load conversation history for a session with prioritized recent messages.
        Provides context for maintaining conversation continuity.
        Only loads messages for the exact session_id provided.
        """
        if not session_id:
            self.logger.warning("_load_conversation_history called without session_id")
            return []
            
        try:
            async with AsyncSessionLocal() as session:
                # Use exact match to ensure we only get messages for this specific session
                result = await session.execute(
                    select(ChatMessage)
                    .where(ChatMessage.session_id == session_id)  # Exact match - only this session
                    .order_by(desc(ChatMessage.created_at))
                    .limit(limit)
                )
                messages = result.scalars().all()
                
                # Verify all messages belong to the requested session (safety check)
                filtered_messages = []
                for msg in messages:
                    if msg.session_id == session_id:  # Double-check session_id matches
                        filtered_messages.append(msg)
                    else:
                        self.logger.warning(f"Message {msg.id} has session_id {msg.session_id} but expected {session_id}, filtering out")
                
                # Convert to list of message dicts, reverse to get chronological order
                history = []
                for msg in reversed(filtered_messages):
                    if msg.role in ["user", "assistant"]:
                        history.append({
                            "role": msg.role,
                            "content": msg.message
                        })
                
                self.logger.info(f"Loaded {len(history)} messages from conversation history for session {session_id} (filtered from {len(messages)} total)")
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
            
            # Check if the last message in history is the same as the current question (avoid duplication)
            if conversation_history and len(conversation_history) > 0:
                last_message = conversation_history[-1]
                if last_message.get("role") == "user" and last_message.get("content") == question:
                    self.logger.info(f"⚠️ Last message in history matches current question, removing duplicate to avoid sending question twice")
                    conversation_history = conversation_history[:-1]  # Remove the duplicate
            
            # Get user_id from input or session
            user_id = input_data.get("user_id")
            self.logger.info(f"🔍 AI Service execute - user_id from input: {user_id}, session_id: {session_id}")
            if not user_id and session_id:
                try:
                    from database.models import ChatSession
                    async with AsyncSessionLocal() as session:
                        from sqlalchemy import select
                        result = await session.execute(
                            select(ChatSession).where(ChatSession.session_id == session_id)
                        )
                        chat_session = result.scalar_one_or_none()
                        if chat_session and hasattr(chat_session, 'user_id') and chat_session.user_id:
                            user_id = chat_session.user_id
                            self.logger.info(f"✅ Retrieved user_id {user_id} from ChatSession {session_id}")
                        else:
                            self.logger.warning(f"⚠️ ChatSession {session_id} found but user_id is {getattr(chat_session, 'user_id', 'N/A') if chat_session else 'session not found'}")
                except Exception as e:
                    self.logger.warning(f"❌ Could not get user_id from session: {e}", exc_info=True)
            
            # Get max_tokens from input_data first, then check system config only if explicitly requested (for AI focus mode/test persona)
            max_tokens_override = input_data.get("max_tokens")
            if max_tokens_override is None and input_data.get("use_system_max_tokens"):
                max_tokens_override = await self._get_system_max_tokens()
            
            # Get persona settings or use defaults
            persona_settings = {}
            if self.persona_config and "anthropic" in self.persona_config:
                anthropic_cfg = self.persona_config["anthropic"]
                persona_settings = {
                    "model": anthropic_cfg.get("anthropic_model", settings.ai_model),
                    "max_tokens": max_tokens_override if max_tokens_override is not None else anthropic_cfg.get("max_tokens", 1024),
                    "temperature": anthropic_cfg.get("temperature"),
                    "top_p": anthropic_cfg.get("top_p"),
                }
                # Filter out None values
                persona_settings = {k: v for k, v in persona_settings.items() if v is not None}
            else:
                # Default behavior without persona
                persona_settings = {
                    "model": settings.ai_model,
                    "max_tokens": max_tokens_override if max_tokens_override is not None else 1024
                }
            
            # Build system prompt with pre-context
            # Check if this is AI focus mode (indicated by use_system_max_tokens flag)
            is_ai_focus_mode = input_data.get("use_system_max_tokens", False)
            system_prompt = await self._build_system_prompt_with_pre_context(user_id, is_ai_focus_mode=is_ai_focus_mode)
            if system_prompt:
                self.logger.info(f"✅ Built system prompt with pre-context (length: {len(system_prompt)}), first 200 chars: {system_prompt[:200]}...")
            else:
                self.logger.warning(f"⚠️ No system prompt built (user_id: {user_id})")
            
            # Build messages array with conversation history + current question
            messages = conversation_history.copy() if conversation_history else []
            messages.append({
                "role": "user",
                "content": question
            })
            
            # Add system parameter if we have a system prompt
            if system_prompt:
                persona_settings["system"] = system_prompt
                self.logger.info(f"📤 Adding system prompt to API call (length: {len(system_prompt)})")
                self.logger.info(f"📋 FULL SYSTEM PROMPT:\n---\n{system_prompt}\n---")
            else:
                self.logger.warning(f"⚠️ No system prompt to add to API call")
            
            self.logger.debug(f"Sending {len(messages)} messages to Claude API (including {len(conversation_history)} from history)")
            self.logger.info(f"🔍 API call will include 'system' parameter: {'system' in persona_settings}")
            
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
            
            # Check if the last message in history is the same as the current question (avoid duplication)
            if conversation_history and len(conversation_history) > 0:
                last_message = conversation_history[-1]
                if last_message.get("role") == "user" and last_message.get("content") == question:
                    self.logger.info(f"⚠️ Last message in history matches current question, removing duplicate to avoid sending question twice")
                    conversation_history = conversation_history[:-1]  # Remove the duplicate
            
            # Get user_id from input or session
            user_id = input_data.get("user_id")
            self.logger.info(f"🔍 AI Service stream_execute - user_id from input: {user_id}, session_id: {session_id}")
            if not user_id and session_id:
                try:
                    from database.models import ChatSession
                    async with AsyncSessionLocal() as session:
                        from sqlalchemy import select
                        result = await session.execute(
                            select(ChatSession).where(ChatSession.session_id == session_id)
                        )
                        chat_session = result.scalar_one_or_none()
                        if chat_session and hasattr(chat_session, 'user_id') and chat_session.user_id:
                            user_id = chat_session.user_id
                            self.logger.info(f"✅ Retrieved user_id {user_id} from ChatSession {session_id}")
                        else:
                            self.logger.warning(f"⚠️ ChatSession {session_id} found but user_id is {getattr(chat_session, 'user_id', 'N/A') if chat_session else 'session not found'}")
                except Exception as e:
                    self.logger.warning(f"❌ Could not get user_id from session: {e}", exc_info=True)
            
            # Get persona settings or use defaults
            persona_settings = {}
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
            else:
                # Default behavior without persona
                persona_settings = {
                    "model": settings.ai_model,
                    "max_tokens": 1024
                }
            
            # Build system prompt with pre-context
            # Check if this is AI focus mode (indicated by use_system_max_tokens flag)
            is_ai_focus_mode = input_data.get("use_system_max_tokens", False)
            system_prompt = await self._build_system_prompt_with_pre_context(user_id, is_ai_focus_mode=is_ai_focus_mode)
            if system_prompt:
                self.logger.info(f"✅ Built system prompt with pre-context (length: {len(system_prompt)}), first 200 chars: {system_prompt[:200]}...")
            else:
                self.logger.warning(f"⚠️ No system prompt built (user_id: {user_id})")
            
            # Build messages array with conversation history + current question
            messages = conversation_history.copy() if conversation_history else []
            messages.append({
                "role": "user",
                "content": question
            })
            
            # Add system parameter if we have a system prompt
            if system_prompt:
                persona_settings["system"] = system_prompt
                self.logger.info(f"📤 Adding system prompt to API call (length: {len(system_prompt)})")
                self.logger.info(f"📋 FULL SYSTEM PROMPT:\n---\n{system_prompt}\n---")
            else:
                self.logger.warning(f"⚠️ No system prompt to add to API call")
            
            self.logger.debug(f"Sending {len(messages)} messages to Claude API (including {len(conversation_history)} from history)")
            self.logger.info(f"🔍 API call will include 'system' parameter: {'system' in persona_settings}")
            
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
            
            # Check if the last message in history is the same as the current question (avoid duplication)
            # This can happen if the user message was saved before loading conversation history
            if conversation_history and len(conversation_history) > 0:
                last_message = conversation_history[-1]
                if last_message.get("role") == "user" and last_message.get("content") == question:
                    self.logger.info(f"⚠️ Last message in history matches current question, removing duplicate to avoid sending question twice")
                    conversation_history = conversation_history[:-1]  # Remove the duplicate
            
            # Get user_id from input or session
            user_id = input_data.get("user_id")
            self.logger.info(f"🔍 AI Service async_stream_execute - user_id from input: {user_id}, session_id: {session_id}")
            if not user_id and session_id:
                try:
                    from database.models import ChatSession
                    async with AsyncSessionLocal() as session:
                        from sqlalchemy import select
                        result = await session.execute(
                            select(ChatSession).where(ChatSession.session_id == session_id)
                        )
                        chat_session = result.scalar_one_or_none()
                        if chat_session and hasattr(chat_session, 'user_id') and chat_session.user_id:
                            user_id = chat_session.user_id
                            self.logger.info(f"✅ Retrieved user_id {user_id} from ChatSession {session_id}")
                        else:
                            self.logger.warning(f"⚠️ ChatSession {session_id} found but user_id is {getattr(chat_session, 'user_id', 'N/A') if chat_session else 'session not found'}")
                except Exception as e:
                    self.logger.warning(f"❌ Could not get user_id from session: {e}", exc_info=True)

            # Get max_tokens from input_data first, then check system config only if explicitly requested (for AI focus mode/test persona)
            max_tokens_override = input_data.get("max_tokens")
            if max_tokens_override is None and input_data.get("use_system_max_tokens"):
                max_tokens_override = await self._get_system_max_tokens()

            # Get persona settings or use defaults
            persona_settings = {}
            if self.persona_config and "anthropic" in self.persona_config:
                anthropic_cfg = self.persona_config["anthropic"]
                persona_settings = {
                    "model": anthropic_cfg.get("anthropic_model", settings.ai_model),
                    "max_tokens": max_tokens_override if max_tokens_override is not None else anthropic_cfg.get("max_tokens", 1024),
                    "temperature": anthropic_cfg.get("temperature"),
                    "top_p": anthropic_cfg.get("top_p"),
                }
                # Filter out None values
                persona_settings = {k: v for k, v in persona_settings.items() if v is not None}
            else:
                persona_settings = {
                    "model": settings.ai_model,
                    "max_tokens": max_tokens_override if max_tokens_override is not None else 1024
                }
            
            # Build system prompt with pre-context
            # Check if this is AI focus mode (indicated by use_system_max_tokens flag)
            is_ai_focus_mode = input_data.get("use_system_max_tokens", False)
            system_prompt = await self._build_system_prompt_with_pre_context(user_id, is_ai_focus_mode=is_ai_focus_mode)
            if system_prompt:
                self.logger.info(f"✅ Built system prompt with pre-context (length: {len(system_prompt)}), first 200 chars: {system_prompt[:200]}...")
            else:
                self.logger.warning(f"⚠️ No system prompt built (user_id: {user_id})")
            
            # Override with preset values if provided (preset takes precedence)
            if input_data.get("system_prompt"):
                self.logger.info(f"⚠️ Overriding system prompt with preset (preset takes precedence over pre-context)")
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
                self.logger.info(f"📤 Adding system prompt to API call (length: {len(system_prompt)})")
                self.logger.info(f"📋 FULL SYSTEM PROMPT:\n---\n{system_prompt}\n---")
            else:
                self.logger.warning(f"⚠️ No system prompt to add to API call")
            
            self.logger.info(f"🔍 API call will include 'system' parameter: {'system' in persona_settings}")
            
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
                self.logger.info(f"✅ System parameter present in sanitized_settings: {'system' in sanitized_settings}")
                self.logger.info(f"✅ System value in sanitized_settings: {sanitized_settings.get('system', 'MISSING')[:100] if sanitized_settings.get('system') else 'MISSING'}...")
                self.logger.debug(f"System prompt length: {len(system_prompt)} chars")
            self.logger.debug(f"Sending {len(messages)} messages to Claude API (including {len(conversation_history)} from history)")
            
            # Verify system is in the final call
            if system_prompt and "system" not in sanitized_settings:
                self.logger.error(f"❌ CRITICAL: system prompt was built but NOT in sanitized_settings! Keys: {list(sanitized_settings.keys())}")
            
            # Stream response from Claude API (async iterator)
            try:
                async with self.async_client.messages.stream(
                    messages=messages,
                    **sanitized_settings
                ) as stream:
                    async for text in stream.text_stream:
                        yield text
            except anthropic.APIStatusError as e:
                self.logger.error(f"❌ Anthropic API error: {e}")
                # If it's an internal server error, provide a helpful message
                if "Internal server error" in str(e):
                    yield "I'm experiencing a temporary issue with the AI service. Please try again in a moment."
                else:
                    yield f"I encountered an error: {str(e)}. Please try again."
                raise
            except Exception as e:
                self.logger.error(f"❌ Unexpected error during streaming: {e}", exc_info=True)
                yield f"I encountered an unexpected error. Please try again."
                raise
                    
        except Exception as e:
            self.logger.error(f"Error calling Anthropic API: {e}", exc_info=True)
            yield f"Error: {str(e)}"
