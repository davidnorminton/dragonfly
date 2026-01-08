"""AI service for general questions using Anthropic Claude API."""
import json
import os
from services.base_service import BaseService
from typing import Dict, Any, Optional
import anthropic
from anthropic import AsyncAnthropic
from config.settings import settings
from config.persona_loader import load_persona_config, get_current_persona_name


class AIService(BaseService):
    """Service for handling general AI questions using Anthropic Claude."""
    
    def __init__(self):
        super().__init__("ai_service")
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
        if not self.async_client:
            return {
                "answer": "AI service is not configured. Please add your Anthropic API key to config/api_keys.json",
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
        
        Returns:
            - answer: str - The AI's response
        """
        await self._ensure_persona_config()
        self.validate_input(input_data, ["question"])
        
        question = input_data["question"]
        
        if not self.client:
            return {
                "answer": "AI service is not configured. Please add your Anthropic API key to config/api_keys.json",
                "question": question,
                "service": "ai_service",
                "error": "no_api_key"
            }
        
        try:
            self.logger.info(f"Processing AI question: {question}")
            
            # Use Claude API (async client)
            if not self.async_client:
                return {
                    "answer": "AI service is not configured. Please add your Anthropic API key to config/api_keys.json",
                    "question": question,
                    "service": "ai_service",
                    "error": "no_api_key"
                }
            
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
                
                # Build messages array (only user/assistant roles, no system role)
                messages = [{
                    "role": "user",
                    "content": question
                }]
            else:
                # Default behavior without persona
                messages = [{
                    "role": "user",
                    "content": question
                }]
                persona_settings = {
                    "model": settings.ai_model,
                    "max_tokens": 1024
                }
            
            # Add system parameter if we have a system prompt
            if system_prompt:
                persona_settings["system"] = system_prompt
            
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
    
    def stream_execute(self, input_data: Dict[str, Any]):
        """
        Execute AI service with streaming response (generator, not async generator).
        
        Expected input:
            - question: str - The question to ask
        
        Yields:
            - str - Chunks of the AI's response
        """
        self.validate_input(input_data, ["question"])
        
        question = input_data["question"]
        
        if not self.client:
            yield "AI service is not configured. Please add your Anthropic API key."
            return
        
        try:
            self.logger.info(f"Processing AI question with streaming: {question}")
            
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
                
                # Build messages array (only user/assistant roles, no system role)
                messages = [{
                    "role": "user",
                    "content": question
                }]
            else:
                # Default behavior without persona
                messages = [{
                    "role": "user",
                    "content": question
                }]
                persona_settings = {
                    "model": settings.ai_model,
                    "max_tokens": 1024
                }
            
            # Add system parameter if we have a system prompt
            if system_prompt:
                persona_settings["system"] = system_prompt
            
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
        
        Yields:
            - str - Chunks of the AI's response
        """
        self.validate_input(input_data, ["question"])
        
        question = input_data["question"]
        
        if not self.async_client:
            yield "AI service is not configured. Please add your Anthropic API key."
            return
        
        try:
            self.logger.info(f"Processing AI question with async streaming: {question}")
            
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
                
                messages = [{
                    "role": "user",
                    "content": question
                }]
            else:
                messages = [{
                    "role": "user",
                    "content": question
                }]
                persona_settings = {
                    "model": settings.ai_model,
                    "max_tokens": 1024
                }
            
            # Add system parameter if we have a system prompt
            if system_prompt:
                persona_settings["system"] = system_prompt
            
            # Stream response from Claude API (async iterator)
            async with self.async_client.messages.stream(
                messages=messages,
                **persona_settings
            ) as stream:
                async for text in stream.text_stream:
                    yield text
                    
        except Exception as e:
            self.logger.error(f"Error calling Anthropic API: {e}", exc_info=True)
            yield f"Error: {str(e)}"
