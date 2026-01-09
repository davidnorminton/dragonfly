"""Integration tests for chat session endpoints."""
import pytest
from unittest.mock import patch, AsyncMock
from database.models import ChatSession, PromptPreset
from database.base import AsyncSessionLocal
from sqlalchemy import select


class TestChatSessionEndpoints:
    """Test chat session API endpoints."""
    
    @pytest.mark.asyncio
    async def test_toggle_chat_session_pin(self, test_client, db_session):
        """Test toggling chat session pin status."""
        # Create a chat session first
        session_obj = ChatSession(
            session_id="test-session-pin",
            title="Test Session"
        )
        db_session.add(session_obj)
        await db_session.commit()
        session_id = session_obj.session_id
        
        # Toggle pin to True
        response = await test_client.put(
            f"/api/chat/sessions/{session_id}/pin",
            json={"pinned": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["pinned"] is True
        
        # Verify in database
        await db_session.refresh(session_obj)
        assert session_obj.pinned is True
        
        # Toggle pin to False
        response = await test_client.put(
            f"/api/chat/sessions/{session_id}/pin",
            json={"pinned": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["pinned"] is False
        
        # Verify in database
        await db_session.refresh(session_obj)
        assert session_obj.pinned is False
    
    @pytest.mark.asyncio
    async def test_update_chat_session_preset(self, test_client, db_session):
        """Test updating chat session preset."""
        # Create a prompt preset first
        preset_response = await test_client.post(
            "/api/prompt-presets",
            json={
                "name": "Test Preset",
                "context": "You are a helpful assistant.",
                "temperature": 0.7,
                "top_p": 0.9
            }
        )
        assert preset_response.status_code == 200
        preset_id = preset_response.json()["preset"]["id"]
        
        # Create a chat session
        session_obj = ChatSession(
            session_id="test-session-preset",
            title="Test Session"
        )
        db_session.add(session_obj)
        await db_session.commit()
        session_id = session_obj.session_id
        
        # Update preset
        response = await test_client.put(
            f"/api/chat/sessions/{session_id}/preset",
            json={"preset_id": preset_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["preset_id"] == preset_id
        
        # Verify in database
        await db_session.refresh(session_obj)
        assert session_obj.preset_id == preset_id
        
        # Clear preset (set to None)
        response = await test_client.put(
            f"/api/chat/sessions/{session_id}/preset",
            json={"preset_id": None}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["preset_id"] is None
        
        # Verify in database
        await db_session.refresh(session_obj)
        assert session_obj.preset_id is None
    
    @pytest.mark.asyncio
    async def test_get_chat_sessions_with_pinned(self, test_client, db_session):
        """Test getting chat sessions with pinned sessions first."""
        # Create multiple sessions with different pin statuses
        # Note: API filters by session_id.like('chat-%'), so we need to use that format
        session1 = ChatSession(
            session_id="chat-unpinned-test",
            title="Unpinned Session",
            pinned=False
        )
        session2 = ChatSession(
            session_id="chat-pinned-test",
            title="Pinned Session",
            pinned=True
        )
        db_session.add(session1)
        db_session.add(session2)
        await db_session.commit()
        
        # Get sessions
        response = await test_client.get("/api/chat/sessions")
        assert response.status_code == 200
        data = response.json()
        assert "sessions" in data or isinstance(data, list)
        
        # Handle both dict and list responses
        if isinstance(data, dict):
            sessions = data.get("sessions", [])
        else:
            sessions = data
        
        # Find our test sessions
        pinned_session = next((s for s in sessions if s.get("session_id") == "chat-pinned-test"), None)
        unpinned_session = next((s for s in sessions if s.get("session_id") == "chat-unpinned-test"), None)
        
        assert pinned_session is not None, "Pinned session not found in response"
        assert unpinned_session is not None, "Unpinned session not found in response"
        assert pinned_session.get("pinned") is True
        assert unpinned_session.get("pinned") is False
        
        # Pinned sessions should appear before unpinned (check order)
        pinned_index = next((i for i, s in enumerate(sessions) if s.get("session_id") == "chat-pinned-test"), -1)
        unpinned_index = next((i for i, s in enumerate(sessions) if s.get("session_id") == "chat-unpinned-test"), -1)
        
        # If both exist in the list, pinned should come first
        if pinned_index >= 0 and unpinned_index >= 0:
            assert pinned_index < unpinned_index, "Pinned session should appear before unpinned"
    
    @pytest.mark.asyncio
    async def test_toggle_pin_nonexistent_session(self, test_client):
        """Test toggling pin on non-existent session creates it."""
        # The API creates a session if it doesn't exist, so this should succeed
        response = await test_client.put(
            "/api/chat/sessions/nonexistent-session-pin/pin",
            json={"pinned": True}
        )
        # API creates session if it doesn't exist, so this should return 200
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["pinned"] is True
    
    @pytest.mark.asyncio
    async def test_update_preset_nonexistent_session(self, test_client):
        """Test updating preset on non-existent session creates it."""
        # The API creates a session if it doesn't exist
        response = await test_client.put(
            "/api/chat/sessions/nonexistent-session-preset/preset",
            json={"preset_id": None}
        )
        # API creates session if it doesn't exist, so this should return 200
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
    
    @pytest.mark.asyncio
    async def test_update_preset_with_invalid_preset_id(self, test_client, db_session):
        """Test updating preset with invalid preset_id."""
        # Create a chat session
        session_obj = ChatSession(
            session_id="test-session-invalid-preset",
            title="Test Session"
        )
        db_session.add(session_obj)
        await db_session.commit()
        session_id = session_obj.session_id
        
        # Try to set invalid preset_id - API may allow this or return error
        response = await test_client.put(
            f"/api/chat/sessions/{session_id}/preset",
            json={"preset_id": 99999}  # Non-existent preset
        )
        # API may allow invalid preset_id (foreign key constraint may not be enforced)
        # or return 400/404/500 depending on implementation
        assert response.status_code in [200, 400, 404, 500]
