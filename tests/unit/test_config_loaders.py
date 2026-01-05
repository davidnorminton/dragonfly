"""Unit tests for configuration loaders."""
import pytest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch, mock_open
from config.persona_loader import load_persona_config, list_available_personas, get_current_persona_name
from config.expert_types_loader import get_expert_type, list_expert_types
from config.location_loader import load_location_config
from config.api_key_loader import load_api_keys


class TestPersonaLoader:
    """Test persona configuration loading."""
    
    def test_load_persona_config(self, tmp_path, mock_persona_config):
        """Test loading a persona configuration."""
        persona_dir = tmp_path / "personas"
        persona_dir.mkdir()
        
        config_file = persona_dir / "test_persona.config"
        with open(config_file, 'w') as f:
            json.dump(mock_persona_config, f)
        
        with patch('config.persona_loader.get_personas_directory', return_value=persona_dir):
            config = load_persona_config("test_persona")
            assert config is not None
            assert config.get("title") == "Test Persona"
    
    def test_list_available_personas(self, tmp_path, mock_persona_config):
        """Test listing available personas."""
        persona_dir = tmp_path / "personas"
        persona_dir.mkdir()
        
        config_file = persona_dir / "test_persona.config"
        with open(config_file, 'w') as f:
            json.dump(mock_persona_config, f)
        
        with patch('config.persona_loader.get_personas_directory', return_value=persona_dir):
            personas = list_available_personas()
            assert len(personas) > 0
            assert any(p.get("name") == "test_persona" for p in personas)


class TestExpertTypesLoader:
    """Test expert types configuration loading."""
    
    def test_get_expert_type(self, tmp_path, mock_expert_type):
        """Test getting an expert type configuration."""
        expert_file = tmp_path / "expert_types.json"
        with open(expert_file, 'w') as f:
            json.dump({"test_expert": mock_expert_type}, f)
        
        with patch('config.expert_types_loader.EXPERT_TYPES_CONFIG_PATH', expert_file):
            expert = get_expert_type("test_expert")
            assert expert is not None
            assert expert.get("name") == "Test Expert"
    
    def test_list_expert_types(self, tmp_path, mock_expert_type):
        """Test listing expert types."""
        expert_file = tmp_path / "expert_types.json"
        with open(expert_file, 'w') as f:
            json.dump({"test_expert": mock_expert_type}, f)
        
        with patch('config.expert_types_loader.EXPERT_TYPES_CONFIG_PATH', expert_file):
            experts = list_expert_types()
            assert len(experts) > 0
            assert any(e.get("id") == "test_expert" for e in experts)


class TestLocationLoader:
    """Test location configuration loading."""
    
    def test_load_location_config(self, tmp_path):
        """Test loading location configuration."""
        location_file = tmp_path / "location.json"
        location_data = {
            "location": "Test Location",
            "latitude": 53.8,
            "longitude": -1.5
        }
        with open(location_file, 'w') as f:
            json.dump(location_data, f)
        
        with patch('config.location_loader.LOCATION_CONFIG_PATH', location_file):
            config = load_location_config()
            assert config is not None
            assert config.get("location") == "Test Location"


class TestAPIKeyLoader:
    """Test API key configuration loading."""
    
    def test_load_api_keys(self, tmp_path, mock_api_keys):
        """Test loading API keys."""
        api_keys_file = tmp_path / "api_keys.json"
        with open(api_keys_file, 'w') as f:
            json.dump(mock_api_keys, f)
        
        with patch('config.api_key_loader.API_KEYS_CONFIG_PATH', api_keys_file):
            keys = load_api_keys()
            assert keys is not None
            assert keys.get("anthropic", {}).get("api_key") == "test-anthropic-key"


