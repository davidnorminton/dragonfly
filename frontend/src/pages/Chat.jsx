import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import { chatAPI } from '../services/api';
import { usePersonas } from '../hooks/usePersonas';
import { useExpertTypes } from '../hooks/useExpertTypes';
import { formatMessage } from '../utils/messageFormatter';
import 'highlight.js/styles/github-dark.css';

export function ChatPage({ sessionId: baseSessionId, onMicClick, searchQuery = '' }) {
  const [mode, setMode] = useState('qa');
  const [expertType, setExpertType] = useState('general');
  const [input, setInput] = useState('');
  const [streamingMessage, setStreamingMessage] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatSessions, setChatSessions] = useState([]);
  const [sessionTitles, setSessionTitles] = useState({});
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  // Initialize with a chat session ID if baseSessionId doesn't start with 'chat-'
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    if (baseSessionId && baseSessionId.startsWith('chat-')) {
      return baseSessionId;
    }
    return `chat-${Date.now()}`;
  });
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);
  const { currentPersona, currentTitle } = usePersonas();
  const { expertTypes } = useExpertTypes();

  // For chat page, use the base session ID directly (it starts with 'chat-')
  // This allows all messages within a chat session to be linked together regardless of mode/expert type
  const sessionId = currentSessionId && currentSessionId.startsWith('chat-') ? currentSessionId : `${currentSessionId || `chat-${Date.now()}`}_${mode}_${expertType}`;

  const { messages, loading, hasMore, isLoadingMore, loadMore, sendMessage, reloadHistory } = useChat(sessionId, mode, currentPersona);
  
  // Debug: log when sessionId changes
  useEffect(() => {
    console.log('[Chat] Session ID changed:', sessionId, 'currentSessionId:', currentSessionId, 'messages count:', messages.length);
  }, [sessionId, currentSessionId, messages.length]);

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

  // Load chat sessions from API - but don't overwrite if we just added a new one
  const isAddingNewSessionRef = useRef(false);
  
  useEffect(() => {
    const loadSessions = async () => {
      // Skip reload if we're in the middle of adding a new session
      if (isAddingNewSessionRef.current) {
        return;
      }
      
      try {
        // Get all chat sessions from API
        const data = await chatAPI.getSessions();
        if (data.success && data.sessions) {
          const sessionList = data.sessions.map(s => s.session_id);
          // Ensure currentSessionId is in the list if it's a chat session
          if (currentSessionId && currentSessionId.startsWith('chat-') && !sessionList.includes(currentSessionId)) {
            sessionList.unshift(currentSessionId); // Add to front
          }
          setChatSessions(sessionList);
          
          // Load titles from sessions
          const titles = {};
          data.sessions.forEach(s => {
            if (s.title) {
              titles[s.session_id] = s.title;
            }
          });
          setSessionTitles(prev => ({ ...prev, ...titles }));
        }
      } catch (err) {
        console.error('Error loading sessions:', err);
      }
    };
    // Debounce to avoid too many calls
    const timeoutId = setTimeout(loadSessions, 500);
    return () => clearTimeout(timeoutId);
  }, [currentSessionId]); // Reload when currentSessionId changes to pick up new sessions

  // Note: reloadHistory is handled by useChat hook when sessionId changes
  // No need to call it here to avoid double-loading

  // Combine messages: DB messages first, then pending user message, then streaming response
  // Filter out duplicates by checking if pending message already exists in filteredMessages
  const pendingExistsInHistory = pendingUserMessage && filteredMessages.some(
    msg => msg.role === 'user' && 
           msg.message === pendingUserMessage.message &&
           Math.abs(new Date(msg.created_at) - new Date(pendingUserMessage.created_at)) < 5000
  );
  
  const allMessages = [
    ...filteredMessages,
    ...(pendingUserMessage && !pendingExistsInHistory ? [pendingUserMessage] : []),
    ...(streamingMessage ? [streamingMessage] : [])
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length, streamingMessage?.message]);

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
    
    const tempUserMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      message: userMessage,
      created_at: new Date().toISOString()
    };
    setPendingUserMessage(tempUserMessage);
    setIsWaiting(true);

    await sendMessage(
      userMessage,
      (fullResponse) => {
        // Update streaming message as chunks arrive
        setStreamingMessage({ id: 'streaming', role: 'assistant', message: fullResponse });
        setIsWaiting(false);
        // Keep pendingUserMessage until history reloads to prevent jumping
      },
      async (fullResponse) => {
        // Message complete - clear streaming and pending, then reload history
        setStreamingMessage(null);
        setIsWaiting(false);
        setPendingUserMessage(null);
        await reloadHistory();
        // Reload session titles after new message
        try {
          const sessions = await chatAPI.getHistory(100, 0, null, null, null);
          const uniqueSessions = new Set();
          if (sessions.messages) {
            sessions.messages.forEach(msg => {
              if (msg.session_id) {
                const baseSession = msg.session_id.split('_')[0];
                uniqueSessions.add(baseSession);
              }
            });
          }
          const sessionList = Array.from(uniqueSessions).slice(0, 20);
          const titles = {};
          for (const sessionId of sessionList) {
            try {
              const titleData = await chatAPI.getSessionTitle(sessionId);
              if (titleData.success && titleData.title) {
                titles[sessionId] = titleData.title;
              }
            } catch (err) {
              // Ignore errors
            }
          }
          setSessionTitles(titles);
        } catch (err) {
          // Ignore errors
        }
      },
      async (error) => {
        console.error('Error sending message:', error);
        setStreamingMessage(null);
        setIsWaiting(false);
        setPendingUserMessage(null);
      },
      mode,
      expertType
    );
  };

  const handleNewChat = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    console.log('[Chat] handleNewChat called, current sessionId:', currentSessionId);
    
    // Set flag to prevent session list reload from overwriting
    isAddingNewSessionRef.current = true;
    
    // Generate a new session ID based on timestamp
    const newSessionId = `chat-${Date.now()}`;
    console.log('[Chat] Creating new session:', newSessionId);
    
    // Clear messages immediately - do this first
    setPendingUserMessage(null);
    setStreamingMessage(null);
    
    // Create temp title locally first
    const tempTitle = `${newSessionId} ${Date.now()}`;
    
    // Add the new session to the list immediately so it appears in sidebar (at the top)
    setChatSessions(prev => {
      const updated = [newSessionId, ...prev.filter(s => s !== newSessionId)];
      return updated.slice(0, 20);
    });
    
    // Set the temp title immediately
    setSessionTitles(prev => ({
      ...prev,
      [newSessionId]: tempTitle
    }));
    
    // Set the new session ID - this will trigger reloadHistory via useEffect in useChat
    setCurrentSessionId(newSessionId);
    console.log('[Chat] Set currentSessionId to:', newSessionId, 'with title:', tempTitle);
    
    // Try to create session in database (but don't wait for it)
    chatAPI.createSession(newSessionId).then(result => {
      if (result.success && result.title) {
        // Update title if API returns a different one
        setSessionTitles(prev => ({
          ...prev,
          [newSessionId]: result.title
        }));
      }
      // Clear flag after a delay to allow session list to reload
      setTimeout(() => {
        isAddingNewSessionRef.current = false;
      }, 1000);
    }).catch(err => {
      console.error('[Chat] Error creating session in DB (non-critical):', err);
      // Continue anyway - session will be created when first message is sent
      // Clear flag after a delay
      setTimeout(() => {
        isAddingNewSessionRef.current = false;
      }, 1000);
    });
  };

  const handleSelectSession = (sessionId) => {
    console.log('[Chat] Selecting session:', sessionId);
    // Clear any pending/streaming messages when switching sessions
    setPendingUserMessage(null);
    setStreamingMessage(null);
    // Stop editing if we were editing
    setEditingSessionId(null);
    // Switch to the selected session - this will trigger useChat to load its history
    setCurrentSessionId(sessionId);
  };

  const handleStartEditTitle = (sessionId, e) => {
    e.stopPropagation();
    setEditingSessionId(sessionId);
    setEditingTitle(sessionTitles[sessionId] || '');
  };

  const handleSaveTitle = async (sessionId, e) => {
    e.stopPropagation();
    try {
      const result = await chatAPI.updateSessionTitle(sessionId, editingTitle);
      if (result.success) {
        setSessionTitles(prev => ({
          ...prev,
          [sessionId]: result.title || null
        }));
        setEditingSessionId(null);
        setEditingTitle('');
      }
    } catch (err) {
      console.error('Error saving title:', err);
    }
  };

  const handleCancelEdit = (e) => {
    e.stopPropagation();
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const getSessionDisplayName = (sessionId) => {
    // If we have a title, use it
    if (sessionTitles[sessionId]) {
      return sessionTitles[sessionId];
    }
    // For chat sessions, show session_id + timestamp as temp title
    if (sessionId.startsWith('chat-')) {
      const timestamp = sessionId.replace('chat-', '');
      return `${sessionId} ${timestamp}`;
    }
    // Fallback: show first part of session ID
    return sessionId.substring(0, 20) + '...';
  };

  // Filter messages to only show those for the current session
  const filteredMessages = messages.filter(msg => {
    if (!msg.session_id) return false;
    // For chat sessions, match exact session_id
    if (sessionId && sessionId.startsWith('chat-')) {
      return msg.session_id === sessionId;
    }
    // For other sessions, match if session_id starts with currentSessionId
    return msg.session_id.startsWith(currentSessionId);
  });

  useEffect(() => {
    // Focus input when component mounts or when empty
    if (inputRef.current && !isWaiting && messages.length === 0 && !pendingUserMessage && !streamingMessage) {
      inputRef.current.focus();
    }
  }, [isWaiting, messages.length, pendingUserMessage, streamingMessage]);

  return (
    <div className="chatgpt-page">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="chatgpt-sidebar">
          <button className="chatgpt-new-chat" onClick={handleNewChat}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New chat
          </button>
          

          <div className="chatgpt-sidebar-nav">
            <button className="chatgpt-nav-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 9h6v6H9z"/>
              </svg>
              Images
            </button>
            <button className="chatgpt-nav-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 9h6v6H9z"/>
              </svg>
              Apps
            </button>
          </div>

          <div className="chatgpt-chats-section">
            <div className="chatgpt-section-title">Your chats</div>
            <div className="chatgpt-chats-list">
              {chatSessions
                .filter((session) => {
                  // Filter by search query if provided
                  if (!searchQuery.trim()) return true;
                  const query = searchQuery.toLowerCase();
                  const title = sessionTitles[session] || getSessionDisplayName(session);
                  return title.toLowerCase().includes(query);
                })
                .map((session) => (
                <div
                  key={session}
                  className={`chatgpt-chat-item ${session === currentSessionId ? 'active' : ''}`}
                  onClick={() => handleSelectSession(session)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  {editingSessionId === session ? (
                    <div className="chatgpt-chat-title-edit" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveTitle(session, e);
                          } else if (e.key === 'Escape') {
                            handleCancelEdit(e);
                          }
                        }}
                        autoFocus
                        className="chatgpt-title-input"
                      />
                      <button onClick={(e) => handleSaveTitle(session, e)} className="chatgpt-title-save">✓</button>
                      <button onClick={handleCancelEdit} className="chatgpt-title-cancel">✕</button>
                    </div>
                  ) : (
                    <span 
                      onDoubleClick={(e) => handleStartEditTitle(session, e)}
                      title="Double-click to edit"
                      className="chatgpt-chat-title"
                    >
                      {getSessionDisplayName(session)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Main Content */}
      <div className="chatgpt-main">
        {/* Header */}
        <div className="chatgpt-header">
          <button 
            className="chatgpt-menu-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18"/>
            </svg>
          </button>
          <div className="chatgpt-header-title">{currentTitle || 'AI Assistant'}</div>
        </div>

        {/* Messages Area */}
        <div className="chatgpt-messages" ref={chatContainerRef}>
          {loading && allMessages.length === 0 ? (
            <div className="chatgpt-empty">Loading...</div>
          ) : allMessages.length === 0 ? (
            <div className="chatgpt-empty">
              <div className="chatgpt-empty-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div className="chatgpt-empty-text">Ready when you are.</div>
            </div>
          ) : (
            <>
              {allMessages.map((msg) => {
                const expertInfo = msg.role === 'assistant' && mode === 'conversational' && expertType !== 'general'
                  ? expertTypes.find(e => e.id === expertType)
                  : null;
                
                return (
                  <div key={msg.id} className={`chatgpt-message ${msg.role}`}>
                    <div className="chatgpt-message-avatar">
                      {msg.role === 'user' ? (
                        <div className="chatgpt-avatar-user">DN</div>
                      ) : (
                        <div className="chatgpt-avatar-assistant">
                          {expertInfo?.icon || '🤖'}
                        </div>
                      )}
                    </div>
                    <div className="chatgpt-message-content">
                      <div className="chatgpt-message-text">
                        {msg.role === 'assistant' ? (
                          <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.message) }}></div>
                        ) : (
                          <div>{msg.message}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {isWaiting && !streamingMessage && (
                <div className="chatgpt-message assistant">
                  <div className="chatgpt-message-avatar">
                    <div className="chatgpt-avatar-assistant">🤖</div>
                  </div>
                  <div className="chatgpt-message-content">
                    <div className="chatgpt-typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chatgpt-input-container">
          <div className="chatgpt-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="chatgpt-input"
              placeholder="Ask anything"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            />
            <div className="chatgpt-input-actions">
              <button 
                onClick={handleSend}
                disabled={!input.trim()}
                title="Send"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13"/>
                  <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
