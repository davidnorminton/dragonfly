"""Unit tests for RAGService."""
import pytest
from unittest.mock import Mock, patch, AsyncMock
from services.rag_service import RAGService
from database.models import ChatMessage


class TestRAGService:
    """Test cases for RAGService."""
    
    @pytest.fixture
    def rag_service(self):
        """Create a RAGService instance for testing."""
        with patch('services.rag_service.settings') as mock_settings:
            mock_settings.ai_api_key = "test-key"
            mock_settings.ai_model = "claude-3-5-haiku-20241022"
            service = RAGService()
            return service
    
    def test_init(self, rag_service):
        """Test RAGService initialization."""
        assert rag_service.name == "rag_service"
        assert rag_service.logger is not None
    
    @pytest.mark.asyncio
    async def test_load_conversation_history(self, rag_service, db_session):
        """Test loading conversation history from database."""
        # Create test messages
        session_id = "test_session_123"
        
        # Import datetime for explicit timestamps
        from datetime import datetime, timedelta
        
        # Create messages with explicit timestamps to ensure ordering
        base_time = datetime.now()
        user_msg = ChatMessage(
            session_id=session_id,
            role="user",
            message="Hello",
            service_name="rag_service",
            created_at=base_time
        )
        assistant_msg = ChatMessage(
            session_id=session_id,
            role="assistant",
            message="Hi there!",
            service_name="rag_service",
            created_at=base_time + timedelta(seconds=1)  # Ensure assistant is created after user
        )
        
        db_session.add(user_msg)
        db_session.add(assistant_msg)
        await db_session.commit()
        
        # Mock AsyncSessionLocal to use our test session
        from unittest.mock import AsyncMock
        with patch('services.rag_service.AsyncSessionLocal') as mock_session_local:
            # Create a mock session that returns our db_session
            mock_session_context = AsyncMock()
            mock_session_context.__aenter__ = AsyncMock(return_value=db_session)
            mock_session_context.__aexit__ = AsyncMock(return_value=None)
            mock_session_local.return_value = mock_session_context
            
            # Load history
            history = await rag_service._load_conversation_history(session_id, limit=50)
            
            assert len(history) == 2
            # Messages are reversed to chronological order (oldest first)
            # So user message (created first) should be first, assistant second
            assert history[0]["role"] == "user"
            assert history[0]["content"] == "Hello"
            assert history[1]["role"] == "assistant"
            assert history[1]["content"] == "Hi there!"
    
    def test_build_system_prompt_with_expert_type(self, rag_service, mock_expert_type):
        """Test building system prompt with expert type."""
        with patch('config.expert_types_loader.get_expert_type', return_value=mock_expert_type):
            prompt = rag_service._build_system_prompt("test_expert")
            # Should contain expert prompt or at least be a valid prompt
            assert len(prompt) > 0
            assert "CRITICAL CONVERSATION RULE" in prompt or "ONE QUESTION" in prompt
    
    def test_build_system_prompt_without_expert_type(self, rag_service):
        """Test building system prompt without expert type."""
        prompt = rag_service._build_system_prompt(None)
        assert len(prompt) > 0
        assert "CRITICAL CONVERSATION RULE" in prompt or "ONE QUESTION" in prompt
    
    @pytest.mark.asyncio
    async def test_execute_without_api_key(self, rag_service):
        """Test execute method without API key."""
        rag_service.client = None
        rag_service.async_client = None
        
        result = await rag_service.execute({
            "query": "test question",
            "session_id": "test_session"
        })
        
        assert "not configured" in result.get("answer", "").lower() or "error" in result.get("answer", "").lower()
    
    def test_stream_execute_without_api_key(self, rag_service):
        """Test stream_execute without API key."""
        rag_service.client = None
        
        generator = rag_service.stream_execute({
            "query": "test",
            "expert_type": "general",
            "messages": []
        })
        
        chunks = list(generator)
        assert len(chunks) > 0
        assert "not configured" in chunks[0].lower() or "error" in chunks[0].lower()
    
    def test_validate_input(self, rag_service):
        """Test input validation."""
        # Valid input
        rag_service.validate_input({"query": "test"}, ["query"])
        
        # Invalid input
        with pytest.raises(ValueError):
            rag_service.validate_input({"question": "test"}, ["query"])

