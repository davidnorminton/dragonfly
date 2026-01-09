"""Integration tests for database viewer endpoints."""
import pytest
from database.base import AsyncSessionLocal
from database.models import ChatSession


class TestDatabaseViewerEndpoints:
    """Test database viewer API endpoints."""
    
    @pytest.mark.asyncio
    async def test_get_database_tables(self, test_client):
        """Test getting all database tables."""
        response = await test_client.get("/api/database/tables")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "tables" in data
        assert isinstance(data["tables"], list)
        
        # Get table names
        table_names = [table["name"] for table in data["tables"]]
        
        # Verify key tables are present
        expected_tables = [
            "chat_sessions",
            "chat_messages",
            "prompt_presets",
            "music_artists",
            "music_albums",
            "music_songs",
            "device_connections",
            "collected_data",
            "system_config",
            "api_keys_config",
            "location_config",
            "persona_configs",
            "router_config",
            "expert_types_config",
            "alarms",
            "article_summaries"
        ]
        
        for expected_table in expected_tables:
            assert expected_table in table_names, f"Table {expected_table} not found in database tables"
    
    @pytest.mark.asyncio
    async def test_get_table_data(self, test_client, db_session):
        """Test getting paginated data from a table."""
        # Use the db_session fixture to create test data
        from database.models import ChatSession
        test_session = ChatSession(
            session_id="test-db-viewer-session",
            title="Test Session for DB Viewer"
        )
        db_session.add(test_session)
        await db_session.commit()
        
        # Get data from chat_sessions table
        response = await test_client.get("/api/database/tables/chat_sessions/data?page=1&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        assert "columns" in data
        assert "pagination" in data
        assert isinstance(data["data"], list)
        assert isinstance(data["columns"], list)
        assert "page" in data["pagination"]
        assert "total_pages" in data["pagination"]
        assert "total_rows" in data["pagination"]
    
    @pytest.mark.asyncio
    async def test_get_table_data_pagination(self, test_client):
        """Test pagination in table data endpoint."""
        response = await test_client.get("/api/database/tables/chat_sessions/data?page=1&limit=5")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["pagination"]["page"] == 1
        assert data["pagination"]["limit"] == 5
        assert len(data["data"]) <= 5
    
    @pytest.mark.asyncio
    async def test_get_nonexistent_table(self, test_client):
        """Test getting data from non-existent table returns 404."""
        response = await test_client.get("/api/database/tables/nonexistent_table/data")
        assert response.status_code == 404
    
    @pytest.mark.asyncio
    async def test_table_columns_info(self, test_client):
        """Test that table info includes column information."""
        response = await test_client.get("/api/database/tables")
        assert response.status_code == 200
        data = response.json()
        
        # Find chat_sessions table
        chat_sessions_table = next(
            (t for t in data["tables"] if t["name"] == "chat_sessions"),
            None
        )
        assert chat_sessions_table is not None
        assert "columns" in chat_sessions_table
        assert len(chat_sessions_table["columns"]) > 0
        
        # Check column structure
        column = chat_sessions_table["columns"][0]
        assert "name" in column
        assert "type" in column
        assert "nullable" in column
        assert "primary_key" in column
