"""Integration tests for AI Focus Mode endpoints and functionality."""
import pytest
import asyncio
from httpx import AsyncClient
from fastapi import status
import time


class TestAIFocusEndpoints:
    """Test AI Focus Mode API endpoints."""
    
    @pytest.mark.asyncio
    async def test_create_ai_focus_session(self, client: AsyncClient, test_user):
        """Test creating a new AI Focus session."""
        session_id = f"ai-focus-question-{int(time.time() * 1000)}"
        
        response = await client.post(
            "/api/ai/focus/create-session",
            json={
                "session_id": session_id,
                "user_id": test_user["id"]
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert "session_id" in data
        assert data["session_id"] == session_id
    
    @pytest.mark.asyncio
    async def test_save_ai_focus_message(self, client: AsyncClient, test_user):
        """Test saving an AI Focus message with question and answer."""
        session_id = f"ai-focus-question-{int(time.time() * 1000)}"
        
        # Create session first
        await client.post(
            "/api/ai/focus/create-session",
            json={"session_id": session_id, "user_id": test_user["id"]}
        )
        
        # Save message
        response = await client.post(
            "/api/ai/focus/save-message",
            json={
                "question": "What is Python?",
                "answer": "Python is a high-level programming language.",
                "mode": "question",
                "persona": "assistant",
                "user_id": test_user["id"],
                "session_id": session_id
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert "message_id" in data
        assert data["session_id"] == session_id
    
    @pytest.mark.asyncio
    async def test_save_audio_file(self, client: AsyncClient, test_user):
        """Test saving audio file metadata for a message."""
        session_id = f"ai-focus-question-{int(time.time() * 1000)}"
        
        # Create session
        await client.post(
            "/api/ai/focus/create-session",
            json={"session_id": session_id, "user_id": test_user["id"]}
        )
        
        # Save message
        msg_response = await client.post(
            "/api/ai/focus/save-message",
            json={
                "question": "Test question",
                "answer": "Test answer",
                "mode": "question",
                "persona": "assistant",
                "user_id": test_user["id"],
                "session_id": session_id
            }
        )
        message_id = msg_response.json()["message_id"]
        
        # Save audio
        response = await client.post(
            "/api/ai/focus/save-audio",
            json={
                "text": "Test answer",
                "message_id": message_id
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert "audio_file_path" in data
    
    @pytest.mark.asyncio
    async def test_get_ai_focus_history(self, client: AsyncClient, test_user):
        """Test retrieving AI Focus conversation history."""
        session_id = f"ai-focus-question-{int(time.time() * 1000)}"
        
        # Create session and add messages
        await client.post(
            "/api/ai/focus/create-session",
            json={"session_id": session_id, "user_id": test_user["id"]}
        )
        
        await client.post(
            "/api/ai/focus/save-message",
            json={
                "question": "Question 1",
                "answer": "Answer 1",
                "mode": "question",
                "persona": "assistant",
                "user_id": test_user["id"],
                "session_id": session_id
            }
        )
        
        # Get history
        response = await client.get(f"/api/ai/focus/history/{session_id}")
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "messages" in data
        assert len(data["messages"]) >= 2  # User and assistant messages
    
    @pytest.mark.asyncio
    async def test_get_ai_focus_sessions(self, client: AsyncClient, test_user):
        """Test retrieving all AI Focus sessions for a user."""
        # Create multiple sessions
        for i in range(3):
            session_id = f"ai-focus-question-{int(time.time() * 1000)}-{i}"
            await client.post(
                "/api/ai/focus/create-session",
                json={"session_id": session_id, "user_id": test_user["id"]}
            )
            await asyncio.sleep(0.01)  # Small delay to ensure unique timestamps
        
        # Get sessions
        response = await client.get(f"/api/ai/focus/sessions?user_id={test_user['id']}")
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert "sessions" in data
        assert len(data["sessions"]) >= 3


class TestTextToAudioStreaming:
    """Test text-to-audio streaming functionality."""
    
    @pytest.mark.asyncio
    async def test_text_to_audio_stream_endpoint(self, client: AsyncClient):
        """Test the text-to-audio streaming endpoint."""
        response = await client.post(
            "/api/ai/text-to-audio-stream",
            json={"text": "Hello, this is a test."}
        )
        
        # Should return streaming response
        assert response.status_code == status.HTTP_200_OK
        assert response.headers["content-type"] == "audio/mpeg"
        
        # Check that we receive audio data
        content = await response.aread()
        assert len(content) > 0
    
    @pytest.mark.asyncio
    async def test_text_to_audio_stream_empty_text(self, client: AsyncClient):
        """Test text-to-audio with empty text returns error."""
        response = await client.post(
            "/api/ai/text-to-audio-stream",
            json={"text": ""}
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert "error" in data
    
    @pytest.mark.asyncio
    async def test_text_to_audio_with_special_characters(self, client: AsyncClient):
        """Test TTS handles special characters and contractions."""
        test_texts = [
            "I'm testing this. You're doing great!",
            "Don't worry, we'll check it.",
            "**Bold** and _italic_ text with markdown.",
            "Text with <html>tags</html> should work."
        ]
        
        for text in test_texts:
            response = await client.post(
                "/api/ai/text-to-audio-stream",
                json={"text": text}
            )
            
            assert response.status_code == status.HTTP_200_OK
            content = await response.aread()
            assert len(content) > 0


class TestAIFocusPerformance:
    """Performance tests for AI Focus Mode."""
    
    @pytest.mark.asyncio
    async def test_message_save_performance(self, client: AsyncClient, test_user):
        """Test message save performance."""
        session_id = f"ai-focus-question-{int(time.time() * 1000)}"
        
        await client.post(
            "/api/ai/focus/create-session",
            json={"session_id": session_id, "user_id": test_user["id"]}
        )
        
        start_time = time.time()
        
        response = await client.post(
            "/api/ai/focus/save-message",
            json={
                "question": "Performance test question",
                "answer": "Performance test answer",
                "mode": "question",
                "persona": "assistant",
                "user_id": test_user["id"],
                "session_id": session_id
            }
        )
        
        elapsed = time.time() - start_time
        
        assert response.status_code == status.HTTP_200_OK
        assert elapsed < 1.0  # Should complete within 1 second
        
        print(f"\n[PERF] Message save: {elapsed * 1000:.2f}ms")
    
    @pytest.mark.asyncio
    async def test_history_retrieval_performance(self, client: AsyncClient, test_user):
        """Test history retrieval performance with multiple messages."""
        session_id = f"ai-focus-question-{int(time.time() * 1000)}"
        
        await client.post(
            "/api/ai/focus/create-session",
            json={"session_id": session_id, "user_id": test_user["id"]}
        )
        
        # Add 10 messages
        for i in range(10):
            await client.post(
                "/api/ai/focus/save-message",
                json={
                    "question": f"Question {i}",
                    "answer": f"Answer {i}",
                    "mode": "question",
                    "persona": "assistant",
                    "user_id": test_user["id"],
                    "session_id": session_id
                }
            )
        
        start_time = time.time()
        response = await client.get(f"/api/ai/focus/history/{session_id}")
        elapsed = time.time() - start_time
        
        assert response.status_code == status.HTTP_200_OK
        assert elapsed < 0.5  # Should retrieve within 500ms
        
        print(f"\n[PERF] History retrieval (10 messages): {elapsed * 1000:.2f}ms")


class TestContextFiltering:
    """Test AI Focus Mode context filtering."""
    
    @pytest.mark.asyncio
    async def test_assistant_only_context(self, client: AsyncClient, test_user):
        """Test that only assistant messages are included in context."""
        # This would need to be tested at the AI service level
        # We'll create a placeholder for now
        pass
    
    @pytest.mark.asyncio
    async def test_token_limit_enforcement(self, client: AsyncClient):
        """Test that 220 token limit is enforced."""
        # This would need to check the AI service configuration
        pass


class TestTextCleaning:
    """Test text cleaning for TTS."""
    
    def test_apostrophe_removal(self):
        """Test that apostrophes are removed from text."""
        from utils.text_cleaner import clean_text_for_tts
        
        test_cases = [
            ("I'm testing", "I am testing"),
            ("you're great", "you are great"),
            ("won't work", "will not work"),
            ("can't do it", "cannot do it"),
            ("It's fine", "it is fine"),
        ]
        
        for input_text, expected_output in test_cases:
            result = clean_text_for_tts(input_text)
            assert "'" not in result
            assert "'" not in result  # Curly apostrophe
            # Check that contractions are expanded (case-insensitive)
            assert "am" in result.lower() or "are" in result.lower() or "not" in result.lower()
    
    def test_markdown_removal(self):
        """Test that markdown is removed from text."""
        from utils.text_cleaner import clean_text_for_tts
        
        test_cases = [
            ("**Bold text**", "Bold text"),
            ("*Italic text*", "Italic text"),
            ("`Code text`", "Code text"),
            ("# Heading", "Heading"),
            ("[Link](http://example.com)", "Link"),
        ]
        
        for input_text, expected in test_cases:
            result = clean_text_for_tts(input_text)
            assert "**" not in result
            assert "*" not in result
            assert "`" not in result
            assert "#" not in result
            assert "[" not in result
            assert "]" not in result
    
    def test_html_removal(self):
        """Test that HTML tags are removed."""
        from utils.text_cleaner import clean_text_for_tts
        
        text = "<p>Hello <strong>world</strong></p>"
        result = clean_text_for_tts(text)
        
        assert "<" not in result
        assert ">" not in result
        assert "Hello world" in result
