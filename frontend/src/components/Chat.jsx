import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import { ttsAPI, chatAPI } from '../services/api';
import { usePersonas } from '../hooks/usePersonas';
import { useExpertTypes } from '../hooks/useExpertTypes';
import { formatMessage } from '../utils/messageFormatter';

export function Chat({ sessionId: baseSessionId, onAudioGenerated, audioQueue, aiFocusMode, onMicClick, onCollapse }) {
  const [mode, setMode] = useState('qa'); // 'qa' or 'conversational'
  const [expertType, setExpertType] = useState('general');
  const [input, setInput] = useState('');
  const [streamingMessage, setStreamingMessage] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState(null);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false); // Track if user has manually scrolled away from bottom
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

  // Set up copy button functionality
  useEffect(() => {
    // Make copy function available globally for onclick handlers
    window.copyCodeBlock = (button) => {
      const base64Code = button.getAttribute('data-code-base64');
      if (!base64Code) return;
      
      try {
        // Decode base64 to get original code
        const decodedCode = decodeURIComponent(escape(atob(base64Code)));
        
        // Copy to clipboard
        navigator.clipboard.writeText(decodedCode).then(() => {
          // Visual feedback
          const copyText = button.querySelector('.copy-text');
          const originalText = copyText.textContent;
          copyText.textContent = 'Copied!';
          button.classList.add('copied');
          
          setTimeout(() => {
            copyText.textContent = originalText;
            button.classList.remove('copied');
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy code:', err);
          // Fallback for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = decodedCode;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          try {
            document.execCommand('copy');
            const copyText = button.querySelector('.copy-text');
            copyText.textContent = 'Copied!';
            setTimeout(() => {
              copyText.textContent = 'Copy';
            }, 2000);
          } catch (e) {
            console.error('Fallback copy failed:', e);
          }
          document.body.removeChild(textarea);
        });
      } catch (e) {
        console.error('Failed to decode code:', e);
      }
    };
    
    return () => {
      delete window.copyCodeBlock;
    };
  }, []);

  useEffect(() => {
    // Only auto-scroll if user hasn't manually scrolled up
    if (userHasScrolledUp) {
      return; // Don't auto-scroll when user is reading
    }
    
    // Auto-scroll to show new content
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, pendingUserMessage, userHasScrolledUp]);

  // Track user scroll position to determine if they've scrolled up
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Check if user has scrolled up from the bottom
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
      
      // If user scrolls to bottom, reset the flag
      if (isAtBottom) {
        setUserHasScrolledUp(false);
      } else {
        // User is scrolled up
        setUserHasScrolledUp(true);
      }
      
      // Load more messages when scrolling to top
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
    setUserHasScrolledUp(false); // Reset scroll flag when sending new message
    
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
      async       (error) => {
        console.error('Error sending message:', error);
        setStreamingMessage(null);
        setIsWaiting(false);
        setPendingUserMessage(null);
        // Don't reload history on error - just keep existing messages visible
        // The messages state is managed by useChat hook, so we don't need to do anything here
      },
      mode,
      expertType  // Send the original expert type ID, not the formatted version
    );
  };

  const handleGenerateTTS = async (messageId, text) => {
    if (!aiFocusMode) {
      console.log('AI mode is off; skipping TTS generation.');
      return;
    }
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

  // Combine messages: pending user message, existing messages, streaming message
  const allMessages = [
    ...(pendingUserMessage ? [pendingUserMessage] : []),
    ...messages,
    ...(streamingMessage ? [streamingMessage] : [])
  ];

  return (
    <div className="right-panel">
      <div className="chat-header-controls">
        <div className="chat-header-row">
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
          {onCollapse && (
            <button className="collapse-btn" onClick={onCollapse} title="Hide chat">
              ▼
            </button>
          )}
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
                  {msg.role === 'assistant' ? (
                    <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.message) }}></div>
                  ) : (
                    <div>{msg.message}</div>
                  )}
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
        <button className="send-button" onClick={handleSend} title="Send message">
          ➤
        </button>
        <button
          className="chat-mic-inline"
          onClick={onMicClick}
          title="AI mic"
          aria-label="AI mic"
        >
          <span className="mic-icon-svg" aria-hidden="true">
            <svg viewBox="0 0 32 32" role="presentation">
              <circle cx="16" cy="16" r="14" fill="#0a0a0f" stroke="#16c782" strokeWidth="2.4" />
              <rect x="12" y="8" width="8" height="12" rx="4" fill="#ffffff" />
              <rect x="11" y="20" width="10" height="3" rx="1.5" fill="#16c782" />
              <line x1="16" y1="23" x2="16" y2="27" stroke="#16c782" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="10" y1="27" x2="22" y2="27" stroke="#16c782" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}

