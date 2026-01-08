"""RAG service for conversational chat with context and expert types."""
import json
import os
from services.base_service import BaseService
from typing import Dict, Any, Optional, List
import anthropic
from anthropic import AsyncAnthropic
from config.settings import settings
from config.persona_loader import load_persona_config, get_current_persona_name
from config.expert_types_loader import get_expert_type
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
        self._load_api_key()
        # Persona config will be loaded async on first use
        self.persona_config = None
    
    def _load_api_key(self):
        """Load API key from config file or environment."""
        api_key = settings.ai_api_key
        
        # Try to load from api_keys.json file
        if not api_key:
            try:
                api_keys_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), settings.api_keys_file)
                if os.path.exists(api_keys_path):
                    with open(api_keys_path, 'r') as f:
                        api_keys = json.load(f)
                        api_key = api_keys.get("anthropic", {}).get("api_key")
                        if api_key:
                            self.logger.info("Loaded Anthropic API key from config file")
            except Exception as e:
                self.logger.warning(f"Could not load API key from config file: {e}")
        
        # Fallback to environment variable
        if not api_key:
            api_key = os.getenv("ANTHROPIC_API_KEY")
        
        if api_key:
            self.client = anthropic.Anthropic(api_key=api_key)
            self.async_client = AsyncAnthropic(api_key=api_key)
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
        await self._ensure_persona_config()
        self.validate_input(input_data, ["query"])
        
        query = input_data["query"]
        session_id = input_data.get("session_id")
        expert_type = input_data.get("expert_type", "general")
        
        if not self.async_client:
            return {
                "answer": "RAG service is not configured. Please add your Anthropic API key.",
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
            yield "RAG service is not configured. Please add your Anthropic API key."
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
            
            # Stream response from Claude API (synchronous iterator)
            with self.client.messages.stream(
                messages=message_list,
                **persona_settings
            ) as stream:
                for text in stream.text_stream:
                    yield text
                    
        except Exception as e:
            self.logger.error(f"Error in RAG service streaming: {e}", exc_info=True)
            yield f"Error: {str(e)}"
