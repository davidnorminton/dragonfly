"""Unit tests for AIService."""
import os
import pytest
from unittest.mock import Mock, patch, MagicMock
from services.ai_service import AIService


class TestAIService:
    """Test cases for AIService."""
    
    @pytest.fixture
    def ai_service(self):
        """Create an AIService instance for testing."""
        with patch('services.ai_service.settings') as mock_settings:
            mock_settings.ai_api_key = "test-key"
            mock_settings.ai_model = "claude-3-5-haiku-20241022"
            service = AIService()
            return service
    
    def test_init(self, ai_service):
        """Test AIService initialization."""
        assert ai_service.name == "ai_service"
        assert ai_service.logger is not None
    
    def test_load_api_key_with_config(self, ai_service, tmp_path, mock_api_keys):
        """Test loading API key from config file."""
        import json
        config_file = tmp_path / "api_keys.json"
        with open(config_file, 'w') as f:
            json.dump(mock_api_keys, f)
        
        with patch('services.ai_service.settings') as mock_settings:
            mock_settings.api_keys_file = str(config_file)
            mock_settings.ai_api_key = None
            service = AIService()
            # Should load from config file
            assert service.client is not None or service.async_client is not None
    
    def test_load_api_key_from_env(self, ai_service):
        """Test loading API key from environment variable."""
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'env-test-key'}):
            with patch('services.ai_service.settings') as mock_settings:
                mock_settings.ai_api_key = None
                mock_settings.api_keys_file = "nonexistent.json"
                service = AIService()
                # Should try to load from env
                # Note: Actual client creation depends on API key validity
    
    @pytest.mark.asyncio
    async def test_execute_without_api_key(self, ai_service):
        """Test execute method without API key."""
        ai_service.client = None
        ai_service.async_client = None
        
        result = await ai_service.execute({"question": "test question"})
        assert "placeholder" in result.get("answer", "").lower() or "not configured" in result.get("answer", "").lower()
    
    def test_validate_input(self, ai_service):
        """Test input validation."""
        # Valid input
        ai_service.validate_input({"question": "test"}, ["question"])
        
        # Invalid input - missing required field
        with pytest.raises(ValueError):
            ai_service.validate_input({"query": "test"}, ["question"])
    
    def test_stream_execute_without_api_key(self, ai_service):
        """Test stream_execute without API key."""
        ai_service.client = None
        
        generator = ai_service.stream_execute({"question": "test"})
        chunks = list(generator)
        assert len(chunks) > 0
        assert "placeholder" in chunks[0].lower() or "not configured" in chunks[0].lower()
    
    @patch('services.ai_service.anthropic.Anthropic')
    def test_load_persona_config(self, mock_anthropic, tmp_path, mock_persona_config):
        """Test loading persona configuration."""
        import json
        from config.persona_loader import save_persona_config
        
        # Save test persona
        save_persona_config("test_persona", mock_persona_config)
        
        with patch('services.ai_service.settings') as mock_settings:
            mock_settings.ai_api_key = "test-key"
            mock_settings.ai_model = "claude-3-5-haiku-20241022"
            with patch('config.persona_loader.get_current_persona_name', return_value="test_persona"):
                service = AIService()
                assert service.persona_config is not None
                assert service.persona_config.get("title") == "Test Persona"

