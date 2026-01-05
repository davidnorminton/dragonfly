"""Pytest configuration and fixtures."""
import pytest
import asyncio
import os
import tempfile
import shutil
from pathlib import Path
from typing import AsyncGenerator, Generator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

# Import settings and database
from config.settings import settings
from database.base import Base, AsyncSessionLocal
from database import models


# Test database URL (PostgreSQL by default; override with TEST_DATABASE_URL env)
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://dragonfly:dragonfly@localhost:5432/dragonfly_test",
)


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    # Create test engine
    test_engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True,
    )
    
    # Create test session factory
    TestSessionLocal = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False
    )
    
    # Create tables
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create session
    async with TestSessionLocal() as session:
        yield session
    
    # Cleanup
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest.fixture(scope="function")
def temp_config_dir(tmp_path: Path) -> Generator[Path, None, None]:
    """Create a temporary directory for test config files."""
    config_dir = tmp_path / "config"
    config_dir.mkdir(parents=True)
    
    # Create subdirectories
    (config_dir / "personas").mkdir()
    (config_dir / "data").mkdir()
    (config_dir / "data" / "audio").mkdir()
    (config_dir / "data" / "transcripts").mkdir()
    
    yield config_dir
    
    # Cleanup
    shutil.rmtree(config_dir, ignore_errors=True)


@pytest.fixture(scope="function")
def mock_api_keys(tmp_path: Path) -> dict:
    """Create mock API keys for testing."""
    return {
        "anthropic": {
            "api_key": "test-anthropic-key"
        },
        "perplexity": {
            "api_key": "test-perplexity-key"
        },
        "fish_audio": {
            "api_key": "test-fish-audio-key",
            "voice_id": "test-voice-id",
            "voice_engine": "s1"
        },
        "bbc_weather": {
            "location_id": "2638027"
        },
        "waze": {
            "api_key": "test-waze-key"
        }
    }


@pytest.fixture(scope="function")
def mock_persona_config() -> dict:
    """Create mock persona configuration."""
    return {
        "title": "Test Persona",
        "anthropic": {
            "anthropic_model": "claude-3-5-haiku-20241022",
            "prompt_context": "You are a test assistant.",
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 1024
        },
        "fish_audio": {
            "voice_id": "test-voice-id",
            "voice_engine": "s1"
        }
    }


@pytest.fixture(scope="function")
def mock_expert_type() -> dict:
    """Create mock expert type configuration."""
    return {
        "name": "Test Expert",
        "description": "A test expert for testing",
        "system_prompt": "You are a test expert assistant.",
        "icon": "🧪"
    }


