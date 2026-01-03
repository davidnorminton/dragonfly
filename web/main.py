"""FastAPI application for the web GUI."""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging
import asyncio
import json
from typing import Optional, List, Dict, Any
from datetime import datetime
from pathlib import Path
from core.processor import Processor
from services.ai_service import AIService
from database.base import AsyncSessionLocal
from database.models import DeviceConnection, DeviceTelemetry, ChatMessage
from sqlalchemy import select, desc, func
from config.persona_loader import list_available_personas, get_current_persona_name, set_current_persona, load_persona_config
from services.tts_service import TTSService
from services.ai_service import AIService
from fastapi.responses import Response
from utils.transcript_saver import save_transcript
from config.settings import settings

logger = logging.getLogger(__name__)

app = FastAPI(title="Dragonfly Home Assistant")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# This will be set by the main application
processor: Optional[Processor] = None

# Mount static files for audio
project_root = Path(__file__).parent.parent
app.mount("/data", StaticFiles(directory=str(project_root / "data")), name="data")


@app.get("/api/devices")
async def get_devices():
    """Get all connected devices."""
    if not processor:
        raise HTTPException(status_code=500, detail="Processor not initialized")
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DeviceConnection).order_by(desc(DeviceConnection.last_seen))
        )
        devices = result.scalars().all()
        
        return [
            {
                "device_id": d.device_id,
                "device_name": d.device_name,
                "device_type": d.device_type,
                "is_connected": d.is_connected == "true",
                "last_seen": d.last_seen.isoformat() if d.last_seen else None,
                "device_metadata": d.device_metadata or {}
            }
            for d in devices
        ]


@app.get("/api/telemetry/latest")
async def get_latest_telemetry():
    """Get latest telemetry for all devices."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DeviceTelemetry).order_by(desc(DeviceTelemetry.timestamp))
        )
        all_telemetry = result.scalars().all()
        
        latest = {}
        for t in all_telemetry:
            key = f"{t.device_id}:{t.metric_name}"
            if key not in latest:
                latest[key] = {
                    "device_id": t.device_id,
                    "metric_name": t.metric_name,
                    "value": t.value,
                    "unit": t.unit,
                    "timestamp": t.timestamp.isoformat() if t.timestamp else None
                }
        
        return list(latest.values())


@app.get("/api/chat")
async def get_chat_history(limit: int = 50, offset: int = 0, session_id: Optional[str] = None):
    """Get chat history with pagination."""
    async with AsyncSessionLocal() as session:
        # Build base query
        query = select(ChatMessage)
        count_query = select(func.count(ChatMessage.id))
        
        if session_id:
            query = query.where(ChatMessage.session_id == session_id)
            count_query = count_query.where(ChatMessage.session_id == session_id)
        
        # Get total count
        count_result = await session.execute(count_query)
        total_count = count_result.scalar() or 0
        
        # Get messages with pagination
        query = query.order_by(desc(ChatMessage.created_at)).limit(limit).offset(offset)
        result = await session.execute(query)
        messages = result.scalars().all()
        
        return {
            "messages": [
                {
                    "id": m.id,
                    "session_id": m.session_id,
                    "role": m.role,
                    "message": m.message,
                    "service_name": m.service_name,
                    "message_metadata": m.message_metadata or {},
                    "created_at": m.created_at.isoformat() if m.created_at else None
                }
                for m in reversed(messages)
            ],
            "total": total_count,
            "offset": offset,
            "limit": limit,
            "has_more": offset + len(messages) < total_count
        }


@app.post("/api/chat")
async def send_chat_message(request: Request):
    """Send a chat message and get AI response (streaming)."""
    data = await request.json()
    message = data.get("message")
    session_id = data.get("session_id")
    service_name = data.get("service_name", "ai_service")
    stream = data.get("stream", True)
    
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")
    
    # Save user message
    async with AsyncSessionLocal() as session:
        user_msg = ChatMessage(
            session_id=session_id,
            role="user",
            message=message,
            service_name=service_name
        )
        session.add(user_msg)
        await session.commit()
    
    # For streaming responses (AI service)
    if stream and service_name == "ai_service":
        ai_service = AIService()
        ai_service.reload_persona_config()  # Ensure we have the latest persona
        input_data = {"question": message}
        
        async def generate_response():
            full_response = ""
            try:
                loop = asyncio.get_event_loop()
                
                def run_generator():
                    return list(ai_service.stream_execute(input_data))
                
                chunks = await loop.run_in_executor(None, run_generator)
                
                for chunk in chunks:
                    full_response += chunk
                    yield f"data: {json.dumps({'chunk': chunk, 'done': False})}\n\n"
                
                # Save complete response
                async with AsyncSessionLocal() as session:
                    assistant_msg = ChatMessage(
                        session_id=session_id,
                        role="assistant",
                        message=full_response,
                        service_name=service_name
                    )
                    session.add(assistant_msg)
                    await session.commit()
                    
                    # Save transcript
                    try:
                        current_persona = get_current_persona_name()
                        persona_config = load_persona_config(current_persona)
                        model = persona_config.get("anthropic", {}).get("anthropic_model", settings.ai_model) if persona_config else settings.ai_model
                        save_transcript(question=message, answer=full_response, persona=current_persona, model=model, session_id=session_id)
                    except Exception as e:
                        logger.warning(f"Failed to save transcript: {e}")
                
                yield f"data: {json.dumps({'chunk': '', 'done': True})}\n\n"
            except Exception as e:
                logger.error(f"Error in streaming response: {e}", exc_info=True)
                yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"
        
        return StreamingResponse(generate_response(), media_type="text/event-stream")
    
    return {"error": "Non-streaming mode not implemented"}


@app.post("/api/tts/generate")
async def generate_tts(request: Request):
    """Generate audio from text using Fish Audio API with current persona voice."""
    data = await request.json()
    text = data.get("text")
    message_id = data.get("message_id")  # Optional message ID to update
    persona_name = data.get("persona")  # Optional, defaults to current persona
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    # Load persona config to get voice settings
    persona_config = load_persona_config(persona_name) if persona_name else load_persona_config()
    if not persona_config:
        raise HTTPException(status_code=404, detail="Persona config not found")
    
    fish_audio_config = persona_config.get("fish_audio")
    if not fish_audio_config:
        raise HTTPException(status_code=400, detail="Fish Audio config not found in persona")
    
    voice_id = fish_audio_config.get("voice_id")
    voice_engine = fish_audio_config.get("voice_engine", "s1")
    
    if not voice_id:
        raise HTTPException(status_code=400, detail="Voice ID not found in persona config")
    
    # Generate audio
    tts_service = TTSService()
    audio_data, audio_filepath = await tts_service.generate_audio(text, voice_id, voice_engine, save_to_file=True)
    
    if audio_data is None:
        raise HTTPException(status_code=500, detail="Failed to generate audio")
    
    # Update message metadata with audio file path if message_id is provided
    if message_id and audio_filepath:
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(select(ChatMessage).where(ChatMessage.id == message_id))
                message = result.scalar_one_or_none()
                if message:
                    metadata = message.message_metadata or {}
                    metadata["audio_file"] = audio_filepath
                    message.message_metadata = metadata
                    await session.commit()
                    logger.info(f"Updated message {message_id} with audio file: {audio_filepath}")
        except Exception as e:
            logger.warning(f"Failed to update message metadata with audio file: {e}")
    
    # Return audio file
    return Response(
        content=audio_data,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": "attachment; filename=tts_output.mp3"
        }
    )


@app.get("/api/personas")
async def get_personas():
    """Get list of available personas and current persona."""
    personas = list_available_personas()
    current = get_current_persona_name()
    return {
        "personas": personas,
        "current": current
    }


@app.post("/api/personas/select")
async def select_persona(request: Request):
    """Change the current persona."""
    data = await request.json()
    persona_name = data.get("persona")
    
    if not persona_name:
        raise HTTPException(status_code=400, detail="Persona name is required")
    
    # Verify persona exists
    config = load_persona_config(persona_name)
    if not config:
        raise HTTPException(status_code=404, detail=f"Persona '{persona_name}' not found")
    
    # Set the persona
    success = set_current_persona(persona_name)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to set persona")
    
    # Reload persona config in AI service instances (they will reload on next request)
    # For now, we'll let them reload automatically on next request
    
    return {
        "success": True,
        "persona": persona_name,
        "message": f"Persona changed to {persona_name}"
    }


@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    """Serve the main web interface."""
    return get_frontend_html()


def get_frontend_html() -> str:
    """Return the frontend HTML with streaming chat."""
    return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dragonfly Home Assistant</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #0f0f23;
            color: #e0e0e0;
            min-height: 100vh;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px 40px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .header h1 {
            font-size: 1.8em;
            color: white;
        }
        .container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            padding: 20px;
            max-width: 1800px;
            margin: 0 auto;
        }
        .panel {
            background: #1a1a2e;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .panel.full-width {
            grid-column: 1 / -1;
        }
        .panel h2 {
            font-size: 1.5em;
            margin-bottom: 20px;
            color: #667eea;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .panel-header h2 {
            margin: 0;
            border-bottom: none;
            padding-bottom: 0;
        }
        .persona-selector {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .persona-selector label {
            color: #667eea;
            font-size: 0.9em;
        }
        .persona-selector select {
            padding: 8px 12px;
            background: #0f0f23;
            border: 2px solid #2d2d44;
            border-radius: 6px;
            color: #e0e0e0;
            font-size: 0.9em;
            cursor: pointer;
        }
        .persona-selector select:hover {
            border-color: #667eea;
        }
        .persona-selector select:focus {
            outline: none;
            border-color: #667eea;
        }
        .chat-container {
            display: flex;
            flex-direction: column;
            height: 600px;
        }
        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
            background: #0f0f23;
            border-radius: 10px;
            margin-bottom: 15px;
            border: 1px solid #2d2d44;
        }
        .chat-message {
            margin-bottom: 15px;
            padding: 12px;
            border-radius: 10px;
            max-width: 80%;
            word-wrap: break-word;
        }
        .chat-message.user {
            background: #667eea;
            margin-left: auto;
            text-align: right;
        }
        .chat-message.assistant {
            background: #2d2d44;
            border-left: 3px solid #764ba2;
        }
        .chat-message .role {
            font-size: 0.8em;
            opacity: 0.7;
            margin-bottom: 5px;
        }
        .chat-message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 5px;
        }
        .tts-button {
            padding: 4px 8px;
            background: #2d2d44;
            border: 1px solid #667eea;
            border-radius: 4px;
            color: #667eea;
            font-size: 0.75em;
            cursor: pointer;
            opacity: 0.7;
            transition: opacity 0.2s;
        }
        .tts-button:hover {
            opacity: 1;
            background: #3d3d54;
        }
        .tts-button:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        .audio-player {
            margin-top: 8px;
            width: 100%;
            max-width: 300px;
        }
        .audio-player audio {
            width: 100%;
            outline: none;
        }
        .chat-input-container {
            display: flex;
            gap: 10px;
        }
        .chat-input {
            flex: 1;
            padding: 12px;
            background: #0f0f23;
            border: 2px solid #2d2d44;
            border-radius: 8px;
            color: #e0e0e0;
            font-size: 1em;
        }
        .chat-input:focus {
            outline: none;
            border-color: #667eea;
        }
        .btn {
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1em;
        }
        .btn:hover {
            opacity: 0.9;
        }
        .devices-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
        }
        .device-card {
            background: #0f0f23;
            border: 1px solid #2d2d44;
            border-radius: 10px;
            padding: 15px;
        }
        .device-card.connected {
            border-color: #4caf50;
        }
        .device-name {
            font-weight: bold;
            color: #667eea;
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            opacity: 0.5;
        }
    </style>
    <script>
        // Load or create session ID from localStorage
        let chatSessionId = localStorage.getItem('chatSessionId') || 'session-' + Date.now();
        if (!localStorage.getItem('chatSessionId')) {
            localStorage.setItem('chatSessionId', chatSessionId);
        }
        
        let chatOffset = 0;
        let chatHasMore = true;
        let isLoadingMore = false;
        
        async function loadChatHistory(resetScroll) {
            try {
                chatOffset = 0;
                // Load all previous chats (no session_id filter)
                const response = await fetch('/api/chat?limit=50&offset=0');
                const data = await response.json();
                chatHasMore = data.has_more;
                chatOffset = data.messages.length;
                renderChatMessages(data.messages, true, resetScroll !== false);
            } catch (error) {
                console.error('Error loading chat history:', error);
            }
        }
        
        async function loadMoreChatHistory() {
            if (isLoadingMore || !chatHasMore) return;
            
            isLoadingMore = true;
            try {
                const container = document.getElementById('chatMessages');
                const oldScrollHeight = container.scrollHeight;
                
                // Load all previous chats (no session_id filter)
                const response = await fetch('/api/chat?limit=50&offset=' + chatOffset);
                const data = await response.json();
                
                if (data.messages && data.messages.length > 0) {
                    renderChatMessages(data.messages, false, false);
                    chatHasMore = data.has_more;
                    chatOffset += data.messages.length;
                    
                    // Maintain scroll position
                    const newScrollHeight = container.scrollHeight;
                    container.scrollTop = newScrollHeight - oldScrollHeight;
                } else {
                    chatHasMore = false;
                }
            } catch (error) {
                console.error('Error loading more chat history:', error);
            } finally {
                isLoadingMore = false;
            }
        }
        
        function renderChatMessages(messages, replace, scrollToBottom) {
            const container = document.getElementById('chatMessages');
            
            if (replace) {
                if (messages.length === 0) {
                    container.innerHTML = '<div class="empty-state">Start a conversation...</div>';
                    return;
                }
                container.innerHTML = '';
            }
            
            messages.forEach(function(msg) {
                var header = '<div class="role">' + (msg.role === 'user' ? 'You' : 'Assistant') + '</div>';
                var audioPlayer = '';
                
                if (msg.role === 'assistant') {
                    var messageTextEscaped = escapeHtml(msg.message).replace(/'/g, "\\'").replace(/\\n/g, ' ').replace(/"/g, '&quot;');
                    
                    // Check if message has audio file
                    var audioFile = msg.message_metadata && msg.message_metadata.audio_file;
                    if (audioFile) {
                        // Show audio player (no autoplay, preload none)
                        audioPlayer = '<div class="audio-player"><audio controls preload="none"><source src="/' + audioFile + '" type="audio/mpeg">Your browser does not support audio.</audio></div>';
                    }
                    
                    header = '<div class="chat-message-header">' +
                             '<div class="role">Assistant</div>' +
                             '<button class="tts-button" data-msg-id="' + msg.id + '" data-msg-text="' + messageTextEscaped + '">' + (audioFile ? '🔊' : '🔊 Speak') + '</button>' +
                             '</div>';
                }
                
                var messageHtml = '<div class="chat-message ' + msg.role + '" data-message-id="' + msg.id + '">' +
                       header +
                       '<div>' + escapeHtml(msg.message) + '</div>' +
                       audioPlayer +
                       '</div>';
                
                if (replace) {
                    container.innerHTML += messageHtml;
                } else {
                    // Prepend for loading older messages
                    container.insertAdjacentHTML('afterbegin', messageHtml);
                }
            });
            
            // Attach click handlers to all TTS buttons
            container.querySelectorAll('.tts-button').forEach(function(button) {
                if (!button.hasAttribute('data-listener-attached')) {
                    button.setAttribute('data-listener-attached', 'true');
                    button.addEventListener('click', function() {
                        var msgId = button.getAttribute('data-msg-id');
                        var text = button.getAttribute('data-msg-text');
                        generateTTS(msgId, text);
                    });
                }
            });
            
            if (scrollToBottom) {
                container.scrollTop = container.scrollHeight;
            }
        }
        
        async function generateTTS(messageId, text) {
            var button = document.querySelector('[data-message-id="' + messageId + '"] .tts-button');
            if (!button) return;
            
            button.disabled = true;
            button.textContent = '⏳ Generating...';
            
            try {
                const response = await fetch('/api/tts/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text, message_id: messageId })
                });
                
                if (!response.ok) {
                    throw new Error('TTS generation failed');
                }
                
                // Get audio blob (but don't play it)
                const audioBlob = await response.blob();
                URL.createObjectURL(audioBlob); // Create URL but don't use it for playback
                
                // Reload chat history to show the audio player controls
                await loadChatHistory(false);
                
                // Reset button state
                button.disabled = false;
                button.textContent = '🔊';
                
            } catch (error) {
                console.error('Error generating TTS:', error);
                button.disabled = false;
                button.textContent = '🔊 Speak';
                alert('Error generating audio: ' + error.message);
            }
        }
        
        async function sendMessage() {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            
            if (!message) return;
            
            addMessageToChat('user', message);
            input.value = '';
            
            const assistantMessageId = 'msg-' + Date.now();
            addMessageToChat('assistant', '', assistantMessageId);
            
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: message,
                        session_id: chatSessionId,
                        service_name: 'ai_service',
                        stream: true
                    })
                });
                
                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let fullResponse = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.chunk) {
                                    fullResponse += data.chunk;
                                    updateMessageContent(assistantMessageId, fullResponse);
                                }
                                if (data.done) {
                                    await loadChatHistory();
                                    return;
                                }
                                if (data.error) {
                                    updateMessageContent(assistantMessageId, 'Error: ' + data.error);
                                    return;
                                }
                            } catch (e) {
                                console.error('Error parsing SSE data:', e);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error sending message:', error);
                updateMessageContent(assistantMessageId, 'Error: ' + error.message);
            }
        }
        
        function handleChatKeyPress(event) {
            if (event.key === 'Enter') {
                sendMessage();
            }
        }
        
        function addMessageToChat(role, message, messageId = null) {
            const container = document.getElementById('chatMessages');
            if (container.querySelector('.empty-state')) {
                container.innerHTML = '';
            }
            
            const msgId = messageId || 'msg-' + Date.now();
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message ' + role;
            messageDiv.id = msgId;
            messageDiv.setAttribute('data-message-id', msgId);
            
            var header = '<div class="role">' + (role === 'user' ? 'You' : 'Assistant') + '</div>';
            if (role === 'assistant') {
                var messageText = escapeHtml(message);
                var messageTextEscaped = messageText.replace(/'/g, "\\'").replace(/\\n/g, ' ').replace(/"/g, '&quot;');
                header = '<div class="chat-message-header">' +
                         '<div class="role">Assistant</div>' +
                         '<button class="tts-button" data-msg-id="' + msgId + '" data-msg-text="' + messageTextEscaped + '">🔊 Speak</button>' +
                         '</div>';
            }
            
            messageDiv.innerHTML = header +
                '<div class="message-content">' + escapeHtml(message) + '</div>';
            
            container.appendChild(messageDiv);
            
            // Attach click handler to button if it's an assistant message
            if (role === 'assistant') {
                var button = messageDiv.querySelector('.tts-button');
                if (button) {
                    button.addEventListener('click', function() {
                        var text = button.getAttribute('data-msg-text');
                        generateTTS(msgId, text);
                    });
                }
            }
            
            container.scrollTop = container.scrollHeight;
            
            return msgId;
        }
        
        function updateMessageContent(messageId, content) {
            const messageDiv = document.getElementById(messageId);
            if (messageDiv) {
                const contentDiv = messageDiv.querySelector('.message-content');
                if (contentDiv) {
                    contentDiv.textContent = content;
                    
                    // Update the TTS button data attribute with the new content
                    var button = messageDiv.querySelector('.tts-button');
                    if (button && messageDiv.classList.contains('assistant')) {
                        var messageTextEscaped = content.replace(/'/g, "\\'").replace(/\\n/g, ' ').replace(/"/g, '&quot;');
                        button.setAttribute('data-msg-text', messageTextEscaped);
                    }
                    
                    document.getElementById('chatMessages').scrollTop = 
                        document.getElementById('chatMessages').scrollHeight;
                }
            }
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Persona management
        async function loadPersonas() {
            try {
                const response = await fetch('/api/personas');
                const data = await response.json();
                const select = document.getElementById('personaSelect');
                
                // Clear existing options
                select.innerHTML = '';
                
                // Add options
                data.personas.forEach(function(persona) {
                    const option = document.createElement('option');
                    option.value = persona.name;
                    option.textContent = persona.title;
                    if (persona.name === data.current) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });
            } catch (error) {
                console.error('Error loading personas:', error);
            }
        }
        
        async function changePersona(personaName) {
            try {
                const response = await fetch('/api/personas/select', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ persona: personaName })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('Persona changed:', data.message);
                    // Optionally show a notification
                } else {
                    const error = await response.json();
                    console.error('Error changing persona:', error.detail);
                    // Reload to reset dropdown
                    loadPersonas();
                }
            } catch (error) {
                console.error('Error changing persona:', error);
                // Reload to reset dropdown
                loadPersonas();
            }
        }
        
        // Initialize when DOM is ready
        document.addEventListener('DOMContentLoaded', function() {
            loadChatHistory();
            loadPersonas();
            
            // Add infinite scroll for chat
            const chatContainer = document.getElementById('chatMessages');
            chatContainer.addEventListener('scroll', function() {
                // Load more when scrolled to top (within 100px)
                if (chatContainer.scrollTop < 100 && chatHasMore && !isLoadingMore) {
                    loadMoreChatHistory();
                }
            });
        });
    </script>
</head>
<body>
    <div class="header">
        <h1>🪶 Dragonfly Home Assistant</h1>
    </div>
    
    <div class="container">
        <div class="panel full-width">
            <div class="panel-header">
                <h2>💬 Chat with AI</h2>
                <div class="persona-selector">
                    <label for="personaSelect">Persona:</label>
                    <select id="personaSelect" onchange="changePersona(this.value)">
                    </select>
                </div>
            </div>
            <div class="chat-container">
                <div class="chat-messages scrollbar-custom" id="chatMessages">
                    <div class="empty-state">Start a conversation...</div>
                </div>
                <div class="chat-input-container">
                    <input type="text" class="chat-input" id="chatInput" placeholder="Ask a question..." onkeypress="handleChatKeyPress(event)">
                    <button class="btn" onclick="sendMessage()">Send</button>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
    """
