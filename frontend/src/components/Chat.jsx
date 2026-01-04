import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import { ttsAPI, chatAPI } from '../services/api';
import { usePersonas } from '../hooks/usePersonas';
import { useExpertTypes } from '../hooks/useExpertTypes';

export function Chat({ sessionId: baseSessionId, onAudioGenerated, audioQueue }) {
  const [mode, setMode] = useState('qa'); // 'qa' or 'conversational'
  const [expertType, setExpertType] = useState('general');
  const [input, setInput] = useState('');
  const [streamingMessage, setStreamingMessage] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState(null);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const { currentPersona } = usePersonas();
  const { expertTypes } = useExpertTypes();
  const { addToQueue } = audioQueue || {};
  
  // Generate session ID based on mode and expert type
  // For QA mode, always use 'general' (experts only apply to conversational mode)
  // For conversational mode, use formatted expert type name (e.g., "Medical Doctor" -> "medical_doctor")
  let effectiveExpertType = mode === 'qa' ? 'general' : expertType;
  if (mode === 'conversational' && expertType !== 'general') {
    const expertConfig = expertTypes.find(e => e.id === expertType);
    if (expertConfig && expertConfig.name) {
      // Convert name to lowercase and replace spaces with underscores
      effectiveExpertType = expertConfig.name.toLowerCase().replace(/\s+/g, '_');
    }
  }
  const sessionId = `${baseSessionId}_${mode}_${effectiveExpertType}`;
  
  const { messages, loading, hasMore, isLoadingMore, loadMore, sendMessage, reloadHistory } = useChat(sessionId, mode, currentPersona);

  // Reload chat history when mode, expert type, or persona changes
  useEffect(() => {
    reloadHistory();
  }, [mode, expertType, reloadHistory, currentPersona]);
  
  // Listen for persona changes to reload chat
  useEffect(() => {
    const handlePersonaChange = () => {
      reloadHistory();
    };
    window.addEventListener('personaChanged', handlePersonaChange);
    return () => {
      window.removeEventListener('personaChanged', handlePersonaChange);
    };
  }, [reloadHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, pendingUserMessage]);

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
    
    // Immediately add user message to display
    const tempUserMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      message: userMessage,
      created_at: new Date().toISOString()
    };
    setPendingUserMessage(tempUserMessage);
    setIsWaiting(true);
    
    let assistantMessageId = null;

    await sendMessage(
      userMessage,
      (fullResponse) => {
        setStreamingMessage({ id: 'streaming', role: 'assistant', message: fullResponse });
        assistantMessageId = 'streaming';
        setIsWaiting(false);
        setPendingUserMessage(null); // Clear pending message once streaming starts
      },
      async (fullResponse, finalMessageId) => {
        setStreamingMessage(null);
        setIsWaiting(false);
        setPendingUserMessage(null);
        // After message completes, reload history to ensure all messages are displayed
        try {
          await reloadHistory();
        } catch (err) {
          console.error('Error reloading history after message:', err);
        }
        // Add to audio queue
        if (finalMessageId && addToQueue) {
          addToQueue(finalMessageId, fullResponse, currentPersona);
        } else {
          // Fallback: load history to get the actual message ID
          try {
            const data = await chatAPI.getHistory(1, 0, sessionId, mode, currentPersona);
            if (data.messages && data.messages.length > 0) {
              const lastMessage = data.messages[0];
              if (lastMessage.role === 'assistant' && lastMessage.id && addToQueue) {
                addToQueue(lastMessage.id, lastMessage.message, currentPersona);
              }
            }
          } catch (err) {
            console.error('Error adding message to queue:', err);
          }
        }
      },
      async (error) => {
        console.error('Error:', error);
        setStreamingMessage(null);
        setIsWaiting(false);
        setPendingUserMessage(null);
        // Reload history to ensure messages are displayed
        try {
          await reloadHistory();
        } catch (err) {
          console.error('Error reloading history after error:', err);
        }
      },
      mode,
      expertType  // Send the original expert type ID, not the formatted version
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

  // Combine messages: pending user message, existing messages, streaming message
  const allMessages = [
    ...(pendingUserMessage ? [pendingUserMessage] : []),
    ...messages,
    ...(streamingMessage ? [streamingMessage] : [])
  ];

  return (
    <div className="right-panel">
      <div className="chat-header-controls">
        <div className="mode-toggle">
          <label className="mode-toggle-label">
            <input
              type="checkbox"
              checked={mode === 'conversational'}
              onChange={(e) => setMode(e.target.checked ? 'conversational' : 'qa')}
              className="mode-toggle-input"
            />
            <span className="mode-toggle-text">
              {mode === 'qa' ? 'Q&A Mode' : 'Conversational Mode'}
            </span>
          </label>
        </div>
        {mode === 'conversational' && (
          <div className="expert-type-selector">
            <select
              value={expertType}
              onChange={(e) => setExpertType(e.target.value)}
              className="expert-type-select"
            >
              {expertTypes.map((expert) => (
                <option key={expert.id} value={expert.id}>
                  {expert.icon} {expert.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="chat-messages" ref={chatContainerRef}>
        {loading && allMessages.length === 0 ? (
          <div className="empty-state">Loading...</div>
        ) : allMessages.length === 0 ? (
          <div className="empty-state">Start a conversation...</div>
        ) : (
          <>
            {allMessages.map((msg) => {
              // Get expert type info for assistant messages in conversational mode
              const expertInfo = msg.role === 'assistant' && mode === 'conversational' && expertType !== 'general'
                ? expertTypes.find(e => e.id === expertType)
                : null;
              
              return (
                <div key={msg.id} className={`chat-message ${msg.role}`}>
                  {msg.role === 'assistant' ? (
                    <div className="chat-message-header">
                      <div className="role-header">
                        {expertInfo && expertInfo.icon && (
                          <span className="expert-icon">{expertInfo.icon}</span>
                        )}
                        <div className="role">
                          {expertInfo ? expertInfo.name : 'Assistant'}
                        </div>
                      </div>
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
              );
            })}
            {isWaiting && !streamingMessage && (
              <div className="chat-message assistant">
                <div className="chat-message-header">
                  <div className="role-header">
                    {mode === 'conversational' && expertType !== 'general' && expertTypes.find(e => e.id === expertType)?.icon && (
                      <span className="expert-icon">{expertTypes.find(e => e.id === expertType).icon}</span>
                    )}
                    <div className="role">
                      {mode === 'conversational' && expertType !== 'general' 
                        ? expertTypes.find(e => e.id === expertType)?.name || 'Assistant'
                        : 'Assistant'}
                    </div>
                  </div>
                </div>
                <div className="loading-spinner">
                  <div className="spinner"></div>
                </div>
              </div>
            )}
          </>
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

