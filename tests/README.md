# Dragonfly Test Suite

This directory contains unit and integration tests for the Dragonfly Home Assistant.

## Structure

- `tests/unit/` - Unit tests for individual services and components
- `tests/integration/` - Integration tests for API endpoints and WebSocket connections
- `tests/conftest.py` - Pytest configuration and shared fixtures

## Running Tests

### Run all tests
```bash
pytest
```

### Run with coverage
```bash
pytest --cov=services --cov=data_collectors --cov=web --cov-report=html
```

### Run specific test file
```bash
pytest tests/unit/test_ai_service.py
```

### Run specific test
```bash
pytest tests/unit/test_ai_service.py::TestAIService::test_init
```

### Run by marker
```bash
pytest -m unit
pytest -m integration
```

## Test Coverage

The test suite aims to cover:
- All service classes (AIService, RAGService, TTSService)
- All data collectors (WeatherCollector, NewsCollector, TrafficCollector)
- API endpoints (chat, system, devices, data)
- Configuration loading
- Database operations

## Fixtures

Common fixtures are defined in `conftest.py`:
- `db_session` - Database session for testing
- `temp_config_dir` - Temporary directory for config files
- `mock_api_keys` - Mock API keys for testing
- `mock_persona_config` - Mock persona configuration
- `mock_expert_type` - Mock expert type configuration

## Notes

- Tests use an in-memory SQLite database to avoid conflicts
- API keys are mocked to avoid making real API calls
- Some integration tests may require a running server instance


