"""RAG service for conversational chat with context and expert types."""
import os
from services.base_service import BaseService
from typing import Dict, Any, Optional, List
import anthropic
from anthropic import AsyncAnthropic
from config.settings import settings
from config.persona_loader import load_persona_config, get_current_persona_name
from config.expert_types_loader import get_expert_type
from config.api_key_loader import load_api_keys
from database.base import AsyncSessionLocal
from database.models import ChatMessage
from sqlalchemy import select, desc


class RAGService(BaseService):
    """Service for RAG-based conversational chat with context."""
    
    def __init__(self):
        super().__init__("rag_service")
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
            self.logger.warning("No Anthropic API key found. RAG service will return placeholder responses.")
    
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
        Increased limit to 50 to provide better context for continuity.
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
                # Recent messages are prioritized (loaded last, so they appear later in context)
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
    
    def _build_system_prompt(self, expert_type: Optional[str] = None) -> str:
        """Build system prompt combining persona and expert type."""
        system_parts = []
        
        # Get expert type system prompt
        if expert_type:
            expert_config = get_expert_type(expert_type)
            if expert_config and expert_config.get("system_prompt"):
                system_parts.append(expert_config["system_prompt"])
        
        # Get persona system prompt
        if self.persona_config and "anthropic" in self.persona_config:
            persona_prompt = self.persona_config["anthropic"].get("prompt_context")
            if persona_prompt:
                system_parts.append(persona_prompt)
        
        # Combine prompts
        if system_parts:
            base_prompt = "\n\n".join(system_parts)
        else:
            # Default prompt if nothing else
            base_prompt = "You are a helpful and engaging conversational assistant. Have natural, flowing conversations with the user. Ask questions to better understand their needs and interests."
        
        # Add STRONG instruction to ask one question at a time
        single_question_instruction = """

=== CRITICAL CONVERSATION RULE ===
YOU MUST ASK ONLY ONE QUESTION PER RESPONSE. 
- DO NOT list multiple questions (e.g., "Can you tell me...? Also, is it...? And has it...?")
- DO NOT ask follow-up questions in the same message
- Ask ONE question, wait for the user's response, then ask your next question
- If you need to ask multiple things, ask them one at a time in separate exchanges
- Format: Ask your single question, provide any relevant context, then STOP and wait for the user's answer
This is essential for natural, focused conversation flow.
"""
        
        return base_prompt + single_question_instruction
    
    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute RAG service with conversation context.
        
        Expected input:
            - query: str - The query/message
            - session_id: str - Session ID to load conversation history
            - expert_type: str (optional) - Type of expert (therapist, engineer, etc.)
        
        Returns:
            - answer: str - The RAG model's response
            - query: str - The original query
            - expert_type: str - The expert type used
        """
        await self._load_api_key()
        await self._ensure_persona_config()
        self.validate_input(input_data, ["query"])
        
        query = input_data["query"]
        session_id = input_data.get("session_id")
        expert_type = input_data.get("expert_type", "general")
        
        if not self.async_client:
            return {
                "answer": "RAG service is not configured. Please add your Anthropic API key in Settings.",
                "query": query,
                "expert_type": expert_type,
                "error": "no_api_key"
            }
        
        try:
            self.logger.info(f"Processing RAG query: {query} (expert_type: {expert_type}, session_id: {session_id})")
            
            # Load conversation history
            conversation_history = []
            if session_id:
                conversation_history = await self._load_conversation_history(session_id)
            
            # Build messages array with conversation history
            messages = conversation_history.copy()
            # Add current user message
            messages.append({
                "role": "user",
                "content": query
            })
            
            # Get persona settings
            persona_settings = {}
            if self.persona_config and "anthropic" in self.persona_config:
                anthropic_cfg = self.persona_config["anthropic"]
                persona_settings = {
                    "model": anthropic_cfg.get("anthropic_model", settings.ai_model),
                    "max_tokens": anthropic_cfg.get("max_tokens", 1024),
                    "temperature": anthropic_cfg.get("temperature"),
                    "top_p": anthropic_cfg.get("top_p"),
                }
                persona_settings = {k: v for k, v in persona_settings.items() if v is not None}
            else:
                persona_settings = {
                    "model": settings.ai_model,
                    "max_tokens": 1024
                }
            
            # Build system prompt
            system_prompt = self._build_system_prompt(expert_type)
            if system_prompt:
                persona_settings["system"] = system_prompt
            
            # Call Claude API
            message = await self.async_client.messages.create(
                messages=messages,
                **persona_settings
            )
            
            # Extract response
            answer = ""
            if message.content:
                for content_block in message.content:
                    if content_block.type == "text":
                        answer += content_block.text
            
            self.logger.info(f"RAG response generated (length: {len(answer)}, history: {len(conversation_history)} messages)")
            
            return {
                "answer": answer,
                "query": query,
                "expert_type": expert_type,
                "service": "rag_service",
                "history_length": len(conversation_history)
            }
            
        except Exception as e:
            self.logger.error(f"Error in RAG service: {e}", exc_info=True)
            return {
                "answer": f"Error: {str(e)}",
                "query": query,
                "expert_type": expert_type,
                "service": "rag_service",
                "error": str(e)
            }
    
    def stream_execute(self, input_data: Dict[str, Any]):
        """
        Execute RAG service with streaming response (generator, not async generator).
        
        Expected input:
            - query: str - The query/message
            - session_id: str - Session ID to load conversation history
            - expert_type: str (optional) - Type of expert (therapist, engineer, etc.)
        
        Yields:
            - str - Chunks of the AI's response
        
        Note: This is a synchronous generator. Conversation history should be loaded
        before calling this, and passed in input_data as 'messages'.
        """
        self.validate_input(input_data, ["query"])
        
        query = input_data["query"]
        expert_type = input_data.get("expert_type", "general")
        messages = input_data.get("messages", [])  # Pre-loaded conversation history
        
        if not self.client:
            yield "RAG service is not configured. Please add your Anthropic API key in Settings."
            return
        
        try:
            self.logger.info(f"Processing RAG query with streaming: {query} (expert_type: {expert_type})")
            
            # Build messages array with conversation history
            message_list = messages.copy()
            # Add current user message
            message_list.append({
                "role": "user",
                "content": query
            })
            
            # Get persona settings
            persona_settings = {}
            if self.persona_config and "anthropic" in self.persona_config:
                anthropic_cfg = self.persona_config["anthropic"]
                persona_settings = {
                    "model": anthropic_cfg.get("anthropic_model", settings.ai_model),
                    "max_tokens": anthropic_cfg.get("max_tokens", 1024),
                    "temperature": anthropic_cfg.get("temperature"),
                    "top_p": anthropic_cfg.get("top_p"),
                }
                persona_settings = {k: v for k, v in persona_settings.items() if v is not None}
            else:
                persona_settings = {
                    "model": settings.ai_model,
                    "max_tokens": 1024
                }
            
            # Build system prompt
            system_prompt = self._build_system_prompt(expert_type)
            if system_prompt:
                persona_settings["system"] = system_prompt
            
            # Override with model if provided (user selection takes precedence)
            if input_data.get("model"):
                persona_settings["model"] = input_data["model"]
                self.logger.info(f"Using model override: {input_data['model']}")
                
                # Adjust max_tokens based on model if needed
                if "claude-4" in input_data["model"] or "claude-3-7" in input_data["model"]:
                    if persona_settings.get("max_tokens", 1024) < 4096:
                        persona_settings["max_tokens"] = 4096
                elif "haiku" in input_data["model"]:
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
            
            # Log the parameters being sent (excluding system prompt content)
            log_params = {k: v for k, v in sanitized_settings.items() if k != "system"}
            self.logger.info(f"RAG API parameters: {log_params}")
            if system_prompt:
                self.logger.debug(f"System prompt length: {len(system_prompt)} chars")
            
            # Stream response from Claude API (synchronous iterator)
            with self.client.messages.stream(
                messages=message_list,
                **sanitized_settings
            ) as stream:
                for text in stream.text_stream:
                    yield text
                    
        except Exception as e:
            self.logger.error(f"Error in RAG service streaming: {e}", exc_info=True)
            yield f"Error: {str(e)}"
