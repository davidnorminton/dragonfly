import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import { ttsAPI } from '../services/api';
import { usePersonas } from '../hooks/usePersonas';

export function Chat({ sessionId, onAudioGenerated }) {
  const { messages, loading, hasMore, isLoadingMore, loadMore, sendMessage } = useChat(sessionId);
  const [input, setInput] = useState('');
  const [streamingMessage, setStreamingMessage] = useState(null);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const { currentPersona } = usePersonas();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (container.scrollTop < 100 && hasMore && !isLoadingMore) {
        loadMore();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, isLoadingMore, loadMore]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
    
    let assistantMessageId = null;

    await sendMessage(
      userMessage,
      (fullResponse) => {
        setStreamingMessage({ id: 'streaming', role: 'assistant', message: fullResponse });
        assistantMessageId = 'streaming';
      },
      async (fullResponse) => {
        setStreamingMessage(null);
        assistantMessageId = `msg-${Date.now()}`;
      },
      (error) => {
        console.error('Error:', error);
        setStreamingMessage(null);
      }
    );
  };

  const handleGenerateTTS = async (messageId, text) => {
    try {
      const response = await ttsAPI.generate(text, messageId, currentPersona);
      if (!response.ok) throw new Error('TTS generation failed');

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      onAudioGenerated?.(audioUrl);
    } catch (error) {
      console.error('Error generating TTS:', error);
      alert(`Error generating audio: ${error.message}`);
    }
  };

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  const allMessages = streamingMessage 
    ? [...messages, streamingMessage]
    : messages;

  return (
    <div className="right-panel">
      <div className="chat-header">
        <div className="chat-header-title">Conversation</div>
        <div className="chat-header-buttons">
          <button className="chat-header-btn">Clear</button>
          <button className="chat-header-btn">Extract Conversation</button>
        </div>
      </div>
      <div className="chat-messages" ref={chatContainerRef}>
        {loading && allMessages.length === 0 ? (
          <div className="empty-state">Loading...</div>
        ) : allMessages.length === 0 ? (
          <div className="empty-state">Start a conversation...</div>
        ) : (
          allMessages.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              {msg.role === 'assistant' ? (
                <div className="chat-message-header">
                  <div className="role">Assistant</div>
                  <button
                    className="tts-button"
                    onClick={() => handleGenerateTTS(msg.id, msg.message)}
                  >
                    🔊 Speak
                  </button>
                </div>
              ) : (
                <div className="role">You</div>
              )}
              <div dangerouslySetInnerHTML={{ __html: escapeHtml(msg.message) }}></div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-container">
        <input
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="send-button" onClick={handleSend}>
          ➤
        </button>
      </div>
    </div>
  );
}

