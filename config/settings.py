"""Configuration settings for the Dragonfly home assistant."""
from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings."""
    
    # Server settings
    host: str = "0.0.0.0"
    port: int = 1337  # Frontend web server port
    websocket_port: int = 8765
    
    # Database (switch to Postgres by default; override via .env)
    database_url: str = "postgresql+asyncpg://dragonfly:dragonfly@localhost:5432/dragonfly"
    
    # WebSocket settings
    websocket_max_connections: int = 100
    websocket_timeout: int = 300
    
    # Job processing
    max_concurrent_jobs: int = 10
    job_timeout: int = 300  # seconds
    
    # AI/LLM settings
    ai_api_key: Optional[str] = None
    ai_api_url: Optional[str] = None
    ai_model: str = "claude-sonnet-4-5-20250929"  # Claude Sonnet 4.5 - recommended model
    api_keys_file: str = "config/api_keys.json"
    
    # Logging
    log_level: str = "INFO"
    log_file: Optional[str] = None
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Global settings instance
settings = Settings()

