import { useState, useEffect, useRef, useCallback } from 'react';
import { useChat } from '../hooks/useChat';
import { chatAPI } from '../services/api';
import { usePersonas } from '../hooks/usePersonas';
import { useExpertTypes } from '../hooks/useExpertTypes';
import { formatMessage } from '../utils/messageFormatter';
import 'highlight.js/styles/github-dark.css';

export function ChatPage({ sessionId: baseSessionId, onMicClick, searchQuery = '', onSearchResultsChange, selectedUser }) {
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
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [pinnedSessions, setPinnedSessions] = useState(new Set());
  const [deleteConfirmSession, setDeleteConfirmSession] = useState(null);
  const [generatingTitle, setGeneratingTitle] = useState(null);
  const [showContextModal, setShowContextModal] = useState(false);
  const [contextPreset, setContextPreset] = useState({ name: '', context: '', temperature: '', top_p: '' });
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [promptPresets, setPromptPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState(null);
  const [useSystemContext, setUseSystemContext] = useState(true);
  const [improvingContext, setImprovingContext] = useState(false);
  const [infoTooltip, setInfoTooltip] = useState(null);
  const [createPresetExpanded, setCreatePresetExpanded] = useState(false);
  const [sessionPresets, setSessionPresets] = useState({}); // Store preset per session: { sessionId: { presetId: number | null, useSystemContext: boolean } }
  const [deleteError, setDeleteError] = useState(null);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false); // Track if user has manually scrolled away from bottom
  const [personalMode, setPersonalMode] = useState(false);
  const PERSONAL_SESSION_ID = 'personal-chat'; // Fixed session ID for personal mode
  // Initialize with baseSessionId if provided, otherwise null (no auto-creation)
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    if (baseSessionId && baseSessionId.startsWith('chat-')) {
      return baseSessionId;
    }
    return null; // Don't auto-create, wait for user to click "New chat"
  });
  
  // Show indicator when a preset is active
  const selectedPreset = promptPresets.find(p => p.id === selectedPresetId);
  
  // Persist preset selection per session
  // Persist preset selection per session
  const updateSessionPreset = async (sessionId, presetId, useSystem) => {
    // Update local state immediately for UI responsiveness
    setSessionPresets(prev => ({
      ...prev,
      [sessionId]: {
        presetId: presetId,
        useSystemContext: useSystem
      }
    }));
    
    // Save to database
    try {
      const dbPresetId = useSystem ? null : presetId;
      await chatAPI.updateSessionPreset(sessionId, dbPresetId);
    } catch (error) {
      console.error('Error saving preset to database:', error);
      // Revert local state on error
      setSessionPresets(prev => {
        const prevState = prev[sessionId];
        if (prevState) {
          return { ...prev, [sessionId]: prevState };
        }
        return prev;
      });
    }
  };
  
  // Load session presets from database when sessions are loaded
  // This is handled in the loadSessions useEffect below
  
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);
  const { currentPersona, currentTitle } = usePersonas();
  const { expertTypes } = useExpertTypes();

  // For chat page, use the base session ID directly (it starts with 'chat-')
  // This allows all messages within a chat session to be linked together regardless of mode/expert type
  // Only create a session ID if currentSessionId is set (user has selected/created a chat)
  const sessionId = currentSessionId && currentSessionId.startsWith('chat-') ? currentSessionId : (currentSessionId ? `${currentSessionId}_${mode}_${expertType}` : null);

  const { messages, loading, hasMore, isLoadingMore, loadMore, sendMessage, reloadHistory, addMessage } = useChat(sessionId, mode, currentPersona);
  
  // Load personal chat messages when in personal mode
  useEffect(() => {
    if (personalMode) {
      const loadPersonalMessages = async () => {
        try {
          const response = await fetch(`/api/personal/chat/history?session_id=${PERSONAL_SESSION_ID}`);
          const result = await response.json();
          if (result.success && result.messages) {
            // Convert personal chat messages to the format expected by the UI
            const formattedMessages = result.messages.map(msg => ({
              id: msg.id,
              role: msg.role,
              message: msg.message,
              created_at: msg.created_at,
              session_id: PERSONAL_SESSION_ID
            }));
            // Clear existing messages and set new ones
            setPersonalMessages(formattedMessages);
          } else {
            // No messages yet, start with empty array
            setPersonalMessages([]);
          }
        } catch (err) {
          console.error('Error loading personal chat messages:', err);
          setPersonalMessages([]);
        }
      };
      loadPersonalMessages();
    } else if (!personalMode && currentSessionId) {
      // Reload regular chat messages when switching out of personal mode
      reloadHistory();
    }
  }, [personalMode]);
  
  // Get session display name helper function
  const getSessionDisplayName = useCallback((sessionId) => {
    // If we have a title, use it
    if (sessionTitles[sessionId]) {
      return sessionTitles[sessionId];
    }
    // For chat sessions, show session_id + timestamp as temp title
    if (sessionId && sessionId.startsWith('chat-')) {
      const timestamp = sessionId.replace('chat-', '');
      const date = new Date(parseInt(timestamp));
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return sessionId || 'New Chat';
  }, [sessionTitles]);

  // Handle session selection
  const handleSelectSession = useCallback((sessionId) => {
    console.log('[Chat] Selecting session:', sessionId);
    // Clear any pending/streaming messages when switching sessions
    setPendingUserMessage(null);
    setStreamingMessage(null);
    // Stop editing if we were editing
    setEditingSessionId(null);
    // Switch to the selected session - this will trigger useChat to load its history
    // Preset selection will be loaded by useEffect when currentSessionId changes
    setCurrentSessionId(sessionId);
  }, []);

  // Listen for chat session selection from search overlay
  useEffect(() => {
    const handleChatSelect = (e) => {
      const { sessionId } = e.detail;
      if (sessionId) {
        handleSelectSession(sessionId);
      }
    };
    
    window.addEventListener('chatSelectSession', handleChatSelect);
    return () => window.removeEventListener('chatSelectSession', handleChatSelect);
  }, [handleSelectSession]);

  // Load preset selection for current session
  useEffect(() => {
    if (currentSessionId) {
      const sessionPreset = sessionPresets[currentSessionId];
      if (sessionPreset) {
        setSelectedPresetId(sessionPreset.presetId);
        setUseSystemContext(sessionPreset.useSystemContext);
      } else {
        // Default to system context for new sessions
        setSelectedPresetId(null);
        setUseSystemContext(true);
      }
    } else {
      // No session selected
      setSelectedPresetId(null);
      setUseSystemContext(true);
    }
  }, [currentSessionId, sessionPresets]);

  // Update search results for dropdown
  useEffect(() => {
    if (!onSearchResultsChange) return;
    
    if (!searchQuery.trim()) {
      onSearchResultsChange([]);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filteredSessions = chatSessions.filter((session) => {
      const title = sessionTitles[session] || getSessionDisplayName(session);
      return title.toLowerCase().includes(query);
    });
    
    const results = filteredSessions.slice(0, 10).map(session => {
      const sessionPreset = sessionPresets[session];
      let contextInfo = currentTitle || 'System persona';
      
      // If session has a preset, use preset name, otherwise use system persona
      if (sessionPreset && !sessionPreset.useSystemContext && sessionPreset.presetId) {
        const preset = promptPresets.find(p => p.id === sessionPreset.presetId);
        if (preset) {
          contextInfo = preset.name;
        }
      }
      
      return {
        title: sessionTitles[session] || getSessionDisplayName(session),
        subtitle: contextInfo,
        onClick: () => {
          handleSelectSession(session);
        }
      };
    });
    
    onSearchResultsChange(results);
  }, [searchQuery, chatSessions, sessionTitles, sessionPresets, promptPresets, currentTitle, onSearchResultsChange, getSessionDisplayName, handleSelectSession]);
  
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
  const hasLoadedSessionsRef = useRef(false);
  
  useEffect(() => {
    const loadSessions = async () => {
      // Skip reload if we're in the middle of adding a new session
      if (isAddingNewSessionRef.current) {
        return;
      }
      
      try {
        // Get all chat sessions from API
        const data = await chatAPI.getSessions(selectedUser?.id);
        if (data.success && data.sessions) {
          const sessionList = data.sessions.map(s => s.session_id);
          // Only add currentSessionId to list if it exists and is not already there
          // Don't auto-create sessions - only add if user explicitly created one
          if (currentSessionId && currentSessionId.startsWith('chat-') && !sessionList.includes(currentSessionId)) {
            sessionList.unshift(currentSessionId); // Add to front
          }
          setChatSessions(sessionList);
          
          // Load titles, pinned status, and presets from sessions
          const titles = {};
          const pinned = new Set();
          const presets = {};
          data.sessions.forEach(s => {
            if (s.title) {
              titles[s.session_id] = s.title;
            }
            if (s.pinned) {
              pinned.add(s.session_id);
            }
            // Load preset_id from database
            if (s.preset_id !== null && s.preset_id !== undefined) {
              presets[s.session_id] = {
                presetId: s.preset_id,
                useSystemContext: false
              };
            } else {
              presets[s.session_id] = {
                presetId: null,
                useSystemContext: true
              };
            }
          });
          setSessionTitles(prev => ({ ...prev, ...titles }));
          setPinnedSessions(pinned);
          setSessionPresets(presets);
          
          hasLoadedSessionsRef.current = true;
        }
      } catch (err) {
        console.error('Error loading sessions:', err);
      }
    };
    
    // Only load sessions once on initial mount
    // Don't reload when currentSessionId changes to prevent auto-creation
    if (!hasLoadedSessionsRef.current) {
      const timeoutId = setTimeout(loadSessions, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedUser]); // Reload when selected user changes

  // Note: reloadHistory is handled by useChat hook when sessionId changes
  // No need to call it here to avoid double-loading

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
    if (personalMode) {
      // Use personal chat API - always use fixed session ID
      if (!input.trim()) return;
      
      const userMessage = input.trim();
      setInput('');
      
      // Add user message immediately to UI
      const tempUserMessage = {
        id: `temp-user-${Date.now()}`,
        role: 'user',
        message: userMessage,
        created_at: new Date().toISOString(),
        session_id: PERSONAL_SESSION_ID
      };
      setPersonalMessages(prev => [...prev, tempUserMessage]);
      setPendingUserMessage(tempUserMessage);
      setIsWaiting(true);
      setUserHasScrolledUp(false);
      
      try {
        const response = await fetch('/api/personal/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: userMessage,
            session_id: PERSONAL_SESSION_ID,
            user_id: selectedUser?.id
          })
        });
        
        const result = await response.json();
        if (result.success && result.answer) {
          // Add assistant message immediately to UI
          const assistantMessage = {
            id: `temp-assistant-${Date.now()}`,
            role: 'assistant',
            message: result.answer,
            created_at: new Date().toISOString(),
            session_id: PERSONAL_SESSION_ID
          };
          setPersonalMessages(prev => [...prev, assistantMessage]);
          setPendingUserMessage(null);
          
          // Reload from server in background to get proper IDs
          setTimeout(async () => {
            try {
              const historyResponse = await fetch(`/api/personal/chat/history?session_id=${PERSONAL_SESSION_ID}`);
              const historyResult = await historyResponse.json();
              if (historyResult.success && historyResult.messages) {
                const formattedMessages = historyResult.messages.map(msg => ({
                  id: msg.id,
                  role: msg.role,
                  message: msg.message,
                  created_at: msg.created_at,
                  session_id: PERSONAL_SESSION_ID
                }));
                setPersonalMessages(formattedMessages);
              }
            } catch (err) {
              console.error('Error reloading personal messages:', err);
            }
          }, 500);
        } else {
          // Remove user message on error
          setPersonalMessages(prev => prev.filter(m => m.id !== tempUserMessage.id));
          setPendingUserMessage(null);
          alert(`Error: ${result.error || 'Failed to send message'}`);
        }
      } catch (err) {
        // Remove user message on error
        setPersonalMessages(prev => prev.filter(m => m.id !== tempUserMessage.id));
        setPendingUserMessage(null);
        alert(`Error: ${err.message}`);
      } finally {
        setIsWaiting(false);
      }
      return;
    }
    
    // Original chat logic
    if (!input.trim()) return;
    
    // If no session is selected, create a new one first (without clearing messages)
    let sessionToUse = currentSessionId;
    if (!sessionToUse) {
      // Create session inline without calling handleNewChat (which clears messages)
      const newSessionId = `chat-${Date.now()}`;
      const tempTitle = `Chat ${new Date().toLocaleString()}`;
      
      // Set flag to prevent session list reload from overwriting
      isAddingNewSessionRef.current = true;
      
      // Add the new session to the list immediately
      setChatSessions(prev => {
        const updated = [newSessionId, ...prev.filter(s => s !== newSessionId)];
        return updated.slice(0, 20);
      });
      
      // Set the temp title immediately
      setSessionTitles(prev => ({
        ...prev,
        [newSessionId]: tempTitle
      }));
      
      // Set the new session ID - this will trigger useChat to load (but messages will be empty initially)
      setCurrentSessionId(newSessionId);
      sessionToUse = newSessionId;
      
      // Try to create session in database (but don't wait for it)
      chatAPI.createSession(newSessionId, selectedUser?.id).then(result => {
        if (result.success && result.title) {
          setSessionTitles(prev => ({
            ...prev,
            [newSessionId]: result.title
          }));
        }
        isAddingNewSessionRef.current = false;
      }).catch(err => {
        console.error('Error creating session:', err);
        isAddingNewSessionRef.current = false;
      });
      
      // Wait a bit for the session to be set and useChat to initialize
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    const userMessage = input;
    setInput('');
    
    // Store tempUserMessage in a variable accessible to callbacks
    const tempUserMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      message: userMessage,
      created_at: new Date().toISOString(),
      session_id: sessionToUse
    };
    setPendingUserMessage(tempUserMessage);
    setIsWaiting(true);
    setUserHasScrolledUp(false); // Reset scroll flag when sending new message

    await sendMessage(
      userMessage,
      (fullResponse) => {
        // Update streaming message as chunks arrive
        setStreamingMessage({ id: 'streaming', role: 'assistant', message: fullResponse });
        setIsWaiting(false);
        // Keep pendingUserMessage until history reloads to prevent jumping
      },
      async (fullResponse) => {
        // Message complete - append the assistant message directly instead of reloading
        setStreamingMessage(null);
        setIsWaiting(false);
        
        // Create the assistant message object
        const assistantMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          message: fullResponse,
          session_id: sessionToUse,
          created_at: new Date().toISOString()
        };
        
        // First, add the user message to the messages array (from pending)
        if (tempUserMessage) {
          addMessage(tempUserMessage);
        }
        
        // Add the assistant message directly to the messages array
        addMessage(assistantMessage);
        
        // Clear pending message since we've added it to the messages array
        setPendingUserMessage(null);
        
        // Optionally reload history in background to sync with database (but don't clear UI)
        setTimeout(async () => {
          try {
            await reloadHistory();
          } catch (error) {
            console.error('Error reloading history:', error);
          }
        }, 2000);
      },
      async (error) => {
        console.error('Error sending message:', error);
        setStreamingMessage(null);
        setIsWaiting(false);
        setPendingUserMessage(null);
      },
      mode,
      expertType,
      useSystemContext ? null : selectedPresetId // presetId (null if using system context)
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
    chatAPI.createSession(newSessionId, selectedUser?.id).then(result => {
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

  const handleMenuClick = (sessionId, e) => {
    e.stopPropagation();
    if (openMenuId === sessionId) {
      setOpenMenuId(null);
    } else {
      const button = e.currentTarget;
      const rect = button.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right
      });
      setOpenMenuId(sessionId);
    }
  };

  const handleRename = (sessionId, e) => {
    e.stopPropagation();
    setOpenMenuId(null);
    setEditingSessionId(sessionId);
    setEditingTitle(sessionTitles[sessionId] || getSessionDisplayName(sessionId));
  };

  const handlePin = async (sessionId, e) => {
    e.stopPropagation();
    setOpenMenuId(null);
    const isPinned = pinnedSessions.has(sessionId);
    const newPinnedState = !isPinned;
    
    try {
      const result = await chatAPI.togglePin(sessionId, newPinnedState);
      if (result && result.success) {
        setPinnedSessions(prev => {
          const newSet = new Set(prev);
          if (newPinnedState) {
            newSet.add(sessionId);
          } else {
            newSet.delete(sessionId);
          }
          return newSet;
        });
      } else {
        console.error('Failed to toggle pin:', result?.error);
      }
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };

  const handleGenerateTitle = async (sessionId, e) => {
    e.stopPropagation();
    setOpenMenuId(null);
    setGeneratingTitle(sessionId);
    
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/generate-title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success && result.title) {
        // Update local state
        setSessionTitles(prev => ({
          ...prev,
          [sessionId]: result.title
        }));
      } else {
        console.error('Failed to generate title:', result.error);
        // Error is handled silently or could show a toast notification
      }
    } catch (error) {
      console.error('Error generating title:', error);
    } finally {
      setGeneratingTitle(null);
    }
  };

  const handleDelete = (sessionId, e) => {
    e.stopPropagation();
    setOpenMenuId(null);
    setDeleteConfirmSession(sessionId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmSession) return;
    
    const sessionId = deleteConfirmSession;
    setDeleteError(null);
    
    try {
      // Delete from backend
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (response.ok && result && result.success) {
        // Close modal first
        setDeleteConfirmSession(null);
        setDeleteError(null);
        
        // Remove from sessions list
        setChatSessions(prev => prev.filter(s => s !== sessionId));
        // Remove from titles
        setSessionTitles(prev => {
          const newTitles = { ...prev };
          delete newTitles[sessionId];
          return newTitles;
        });
        // Remove from pinned sessions
        setPinnedSessions(prev => {
          const newSet = new Set(prev);
          newSet.delete(sessionId);
          return newSet;
        });
        // Remove preset selection for deleted session
        setSessionPresets(prev => {
          const newPresets = { ...prev };
          delete newPresets[sessionId];
          return newPresets;
        });
        // Preset cleanup is handled by database deletion
        // If it's the current session, clear it without creating a new one
        if (sessionId === currentSessionId) {
          setCurrentSessionId(null);
          setPendingUserMessage(null);
          setStreamingMessage(null);
        }
      } else {
        // Keep modal open and show error
        setDeleteError((result && result.error) || `Failed to delete chat: HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      // Keep modal open and show error
      setDeleteError(error.message || 'Error deleting chat');
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmSession(null);
    setDeleteError(null);
  };

  // Load prompt presets
  useEffect(() => {
    const loadPresets = async () => {
      try {
        const response = await fetch('/api/prompt-presets');
        const data = await response.json();
        if (data.success) {
          setPromptPresets(data.presets || []);
        }
      } catch (error) {
        console.error('Error loading presets:', error);
      }
    };
    loadPresets();
  }, []);

  const handleSavePreset = async () => {
    if (!contextPreset.name.trim() || !contextPreset.context.trim()) {
      alert('Please provide a name and context');
      return;
    }

    try {
      const url = editingPresetId 
        ? `/api/prompt-presets/${editingPresetId}`
        : '/api/prompt-presets';
      const method = editingPresetId ? 'PUT' : 'POST';

      const payload = {
        name: contextPreset.name.trim(),
        context: contextPreset.context.trim(),
        temperature: contextPreset.temperature && contextPreset.temperature.trim() 
          ? parseFloat(contextPreset.temperature) 
          : null,
        top_p: contextPreset.top_p && contextPreset.top_p.trim() 
          ? parseFloat(contextPreset.top_p) 
          : null
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        // Reload presets
        const presetsResponse = await fetch('/api/prompt-presets');
        const presetsData = await presetsResponse.json();
        if (presetsData.success) {
          setPromptPresets(presetsData.presets || []);
          // If we just created/updated the selected preset, update selectedPresetId and select it
          if (result.preset && result.preset.id && currentSessionId) {
            setSelectedPresetId(result.preset.id);
            setUseSystemContext(false);
            updateSessionPreset(currentSessionId, result.preset.id, false);
          }
        }
        // Reset form but keep modal open
        setContextPreset({ name: '', context: '', temperature: '', top_p: '' });
        setEditingPresetId(null);
      } else {
        alert(result.error || 'Failed to save preset');
      }
    } catch (error) {
      console.error('Error saving preset:', error);
      alert('Error saving preset: ' + (error.message || 'Unknown error'));
    }
  };

  const handleDeletePreset = async (presetId) => {
    if (!confirm('Delete this preset?')) return;

    try {
      const response = await fetch(`/api/prompt-presets/${presetId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      if (result.success) {
        // Reload presets
        const presetsResponse = await fetch('/api/prompt-presets');
        const presetsData = await presetsResponse.json();
        if (presetsData.success) {
          setPromptPresets(presetsData.presets || []);
        }
        if (selectedPresetId === presetId && currentSessionId) {
          setSelectedPresetId(null);
          setUseSystemContext(true);
          updateSessionPreset(currentSessionId, null, true);
        }
      } else {
        alert(result.error || 'Failed to delete preset');
      }
    } catch (error) {
      console.error('Error deleting preset:', error);
      alert('Error deleting preset: ' + error.message);
    }
  };

  const handleImproveContext = async () => {
    if (!contextPreset.name.trim() || !contextPreset.context.trim()) {
      return;
    }

    setImprovingContext(true);
    try {
      const response = await fetch('/api/prompt-presets/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contextPreset.name.trim(),
          context: contextPreset.context.trim()
        })
      });

      const result = await response.json();
      if (result.success && result.improved_context) {
        setContextPreset({
          ...contextPreset,
          context: result.improved_context
        });
      } else {
        const errorMsg = result.error || 'Failed to improve context';
        console.error('Improve context error:', errorMsg);
        alert(errorMsg);
      }
    } catch (error) {
      console.error('Error improving context:', error);
      alert('Error improving context: ' + (error.message || 'Unknown error'));
    } finally {
      setImprovingContext(false);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuId(null);
    };
    if (openMenuId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuId]);

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
    // Only auto-scroll if user hasn't manually scrolled up
    if (userHasScrolledUp) {
      return; // Don't auto-scroll when user is reading
    }
    
    // Auto-scroll to show new content
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length, streamingMessage?.message, userHasScrolledUp]);

  useEffect(() => {
    // Focus input when component mounts or when empty
    if (inputRef.current && !isWaiting && messages.length === 0 && !pendingUserMessage && !streamingMessage) {
      inputRef.current.focus();
    }
  }, [isWaiting, messages.length, pendingUserMessage, streamingMessage]);

  useEffect(() => {
    // Reset textarea height when input is cleared
    if (inputRef.current && !input) {
      inputRef.current.style.height = 'auto';
    }
  }, [input]);

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
                .sort((a, b) => {
                  // Sort pinned sessions first
                  const aPinned = pinnedSessions.has(a);
                  const bPinned = pinnedSessions.has(b);
                  if (aPinned && !bPinned) return -1;
                  if (!aPinned && bPinned) return 1;
                  return 0;
                })
                .map((session) => (
                <div
                  key={session}
                  className={`chatgpt-chat-item ${session === currentSessionId ? 'active' : ''} ${pinnedSessions.has(session) ? 'pinned' : ''}`}
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
                    <span className="chatgpt-chat-title">
                      {getSessionDisplayName(session)}
                    </span>
                  )}
                  <div className="chatgpt-chat-item-actions">
                    <button
                      className="chatgpt-chat-menu-btn"
                      onClick={(e) => handleMenuClick(session, e)}
                      title="More options"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="5" r="1"/>
                        <circle cx="12" cy="12" r="1"/>
                        <circle cx="12" cy="19" r="1"/>
                      </svg>
                    </button>
                    {openMenuId === session && (
                      <div 
                        className="chatgpt-chat-menu" 
                        style={{
                          top: `${menuPosition.top}px`,
                          right: `${menuPosition.right}px`
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button className="chatgpt-chat-menu-item" onClick={(e) => handleGenerateTitle(session, e)} disabled={generatingTitle === session}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2v4M12 18v4M4 12H2M6.314 6.314l-2.828-2.828M20.485 20.485l-2.828-2.828M17.686 6.314l2.828-2.828M3.515 20.485l2.828-2.828M22 12h-2M6.314 17.686l-2.828 2.828M20.485 3.515l-2.828 2.828"/>
                            <circle cx="12" cy="12" r="4"/>
                          </svg>
                          {generatingTitle === session ? 'Generating...' : 'Generate'}
                        </button>
                        <button className="chatgpt-chat-menu-item" onClick={(e) => handleRename(session, e)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                          Rename
                        </button>
                        <button className="chatgpt-chat-menu-item" onClick={(e) => handlePin(session, e)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 17v5M5 17h14l-1-7H6l-1 7zM9 10V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6"/>
                          </svg>
                          {pinnedSessions.has(session) ? 'Unpin' : 'Pin'}
                        </button>
                        <button className="chatgpt-chat-menu-item chatgpt-chat-menu-item-danger" onClick={(e) => handleDelete(session, e)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
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
          <div className="chatgpt-header-title">
            {useSystemContext 
              ? (currentTitle || 'AI Assistant')
              : (selectedPreset ? selectedPreset.name : 'AI Assistant')
            }
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              cursor: 'pointer',
              fontSize: '0.9em',
              color: 'rgba(255,255,255,0.8)'
            }}>
              <input
                type="checkbox"
                checked={personalMode}
                onChange={(e) => setPersonalMode(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer'
                }}
              />
              <span>Personal Mode</span>
            </label>
          </div>
        </div>

        {/* Messages Area */}
        <div className="chatgpt-messages" ref={chatContainerRef}>
          {!personalMode && !currentSessionId ? (
            <div className="chatgpt-empty">
              <div className="chatgpt-empty-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div className="chatgpt-empty-text">Click "New chat" to start a conversation</div>
            </div>
          ) : (personalMode ? false : loading) && allMessages.length === 0 ? (
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
            <button
              className={`chatgpt-context-btn ${!useSystemContext && selectedPresetId ? 'active' : ''}`}
              onClick={() => setShowContextModal(true)}
              title={!useSystemContext && selectedPreset ? `Active preset: ${selectedPreset.name}` : useSystemContext ? "Using system context" : "Set custom context"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4 12H2M6.314 6.314l-2.828-2.828M20.485 20.485l-2.828-2.828M17.686 6.314l2.828-2.828M3.515 20.485l2.828-2.828M22 12h-2M6.314 17.686l-2.828 2.828M20.485 3.515l-2.828 2.828"/>
                <circle cx="12" cy="12" r="4"/>
              </svg>
            </button>
            <textarea
              ref={inputRef}
              className="chatgpt-input"
              placeholder="Ask anything"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize textarea to fit content
                e.target.style.height = 'auto';
                const newHeight = Math.min(e.target.scrollHeight, 200);
                e.target.style.height = newHeight + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              style={{ resize: 'none' }}
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmSession && (
        <div className="delete-confirm-overlay" onClick={cancelDelete}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-confirm-header">
              <h3>Delete Chat</h3>
            </div>
            <div className="delete-confirm-body">
              <p>Are you sure you want to delete this chat?</p>
              <p className="delete-confirm-session-name">
                {sessionTitles[deleteConfirmSession] || getSessionDisplayName(deleteConfirmSession)}
              </p>
              <p className="delete-confirm-warning">This action cannot be undone.</p>
              {deleteError && (
                <p className="delete-confirm-error">{deleteError}</p>
              )}
            </div>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={cancelDelete}>
                Cancel
              </button>
              <button className="delete-confirm-delete" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Preset Modal */}
      {showContextModal && (
        <div className="context-modal-overlay" onClick={() => {
          setShowContextModal(false);
          setInfoTooltip(null);
        }}>
          <div className="context-modal" onClick={(e) => e.stopPropagation()}>
            <div className="context-modal-header">
              <h3>Custom Context & Settings</h3>
              <button className="context-modal-close" onClick={() => {
                setShowContextModal(false);
                setInfoTooltip(null);
              }}>×</button>
            </div>
            <div className="context-modal-body">
              {/* Create Context Section - Collapsible */}
              <div className="context-section-collapsible">
                <h4 
                  className="context-section-title" 
                  onClick={() => setCreatePresetExpanded(!createPresetExpanded)}
                >
                  <span className="collapse-icon">{createPresetExpanded ? '▼' : '▶'}</span>
                  Create Context
                </h4>
                {createPresetExpanded && (
                  <>
                    <div className="context-form-group">
                      <label>Preset Name</label>
                      <input
                        type="text"
                        className="context-input"
                        placeholder="e.g., PhD Chemist"
                        value={contextPreset.name}
                        onChange={(e) => setContextPreset({ ...contextPreset, name: e.target.value })}
                      />
                    </div>
                    <div className="context-form-group">
                      <label>Custom Context</label>
                      <textarea
                        className="context-textarea"
                        placeholder="You are a phd level chemist etc..."
                        rows="4"
                        value={contextPreset.context}
                        onChange={(e) => setContextPreset({ ...contextPreset, context: e.target.value })}
                      />
                      <button
                        className="context-improve-btn"
                        onClick={handleImproveContext}
                        disabled={improvingContext || !contextPreset.name.trim() || !contextPreset.context.trim()}
                        title="Use AI to improve the context"
                      >
                        {improvingContext ? (
                          <>
                            <svg className="context-improve-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                            </svg>
                            Improving...
                          </>
                        ) : (
                          <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 2v4M12 18v4M4 12H2M6.314 6.314l-2.828-2.828M20.485 20.485l-2.828-2.828M17.686 6.314l2.828-2.828M3.515 20.485l2.828-2.828M22 12h-2M6.314 17.686l-2.828 2.828M20.485 3.515l-2.828 2.828"/>
                              <circle cx="12" cy="12" r="4"/>
                            </svg>
                            Improve with AI
                          </>
                        )}
                      </button>
                    </div>
                    <div className="context-form-row">
                      <div className="context-form-group">
                        <label>
                          Temperature
                          <button
                            className="context-info-btn"
                            onClick={(e) => {
                              e.preventDefault();
                              setInfoTooltip(infoTooltip === 'temperature' ? null : 'temperature');
                            }}
                            title="What is Temperature?"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M12 16v-4M12 8h.01"/>
                            </svg>
                          </button>
                          {infoTooltip === 'temperature' && (
                            <div className="context-info-tooltip">
                              <p><strong>Temperature</strong> controls randomness in the AI's responses.</p>
                              <ul>
                                <li><strong>0.0</strong>: More deterministic, focused responses</li>
                                <li><strong>0.7</strong>: Balanced creativity and consistency</li>
                                <li><strong>1.0</strong>: More creative and varied responses</li>
                              </ul>
                              <p>Lower values make responses more predictable; higher values increase creativity.</p>
                            </div>
                          )}
                        </label>
                        <input
                          type="number"
                          className="context-input"
                          placeholder="0.0 - 1.0"
                          min="0"
                          max="1"
                          step="0.1"
                          value={contextPreset.temperature}
                          onChange={(e) => setContextPreset({ ...contextPreset, temperature: e.target.value })}
                        />
                      </div>
                      <div className="context-form-group">
                        <label>
                          Top P
                          <button
                            className="context-info-btn"
                            onClick={(e) => {
                              e.preventDefault();
                              setInfoTooltip(infoTooltip === 'top_p' ? null : 'top_p');
                            }}
                            title="What is Top P?"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M12 16v-4M12 8h.01"/>
                            </svg>
                          </button>
                          {infoTooltip === 'top_p' && (
                            <div className="context-info-tooltip">
                              <p><strong>Top P</strong> (nucleus sampling) controls diversity by limiting token selection.</p>
                              <ul>
                                <li><strong>0.1</strong>: Only considers most likely tokens (narrow)</li>
                                <li><strong>0.9</strong>: Considers a wider range of tokens (broad)</li>
                                <li><strong>1.0</strong>: Considers all tokens (maximum diversity)</li>
                              </ul>
                              <p>Lower values produce more focused responses; higher values allow more diverse word choices.</p>
                            </div>
                          )}
                        </label>
                        <input
                          type="number"
                          className="context-input"
                          placeholder="0.0 - 1.0"
                          min="0"
                          max="1"
                          step="0.1"
                          value={contextPreset.top_p}
                          onChange={(e) => setContextPreset({ ...contextPreset, top_p: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="context-save-preset-section">
                      <button className="context-btn-save-preset" onClick={handleSavePreset}>
                        {editingPresetId ? 'Update' : 'Save'} Preset
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="context-presets-list">
                <label>Context Selection</label>
                <div className="context-presets">
                  <div className={`context-preset-item ${useSystemContext ? 'active' : ''}`}>
                    <label className="context-radio-label">
                      <input
                        type="radio"
                        name="context-selection"
                        checked={useSystemContext}
                        onChange={() => {
                          setUseSystemContext(true);
                          setSelectedPresetId(null);
                          if (currentSessionId) {
                            updateSessionPreset(currentSessionId, null, true);
                          }
                        }}
                        className="context-radio-input"
                      />
                      <span className="context-preset-name">Use system context</span>
                    </label>
                  </div>
                  {promptPresets.length === 0 ? (
                    <p className="context-no-presets">No presets saved yet</p>
                  ) : (
                    promptPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className={`context-preset-item ${selectedPresetId === preset.id ? 'active' : ''}`}
                        onClick={() => {
                          setUseSystemContext(false);
                          setSelectedPresetId(preset.id);
                          if (currentSessionId) {
                            updateSessionPreset(currentSessionId, preset.id, false);
                          }
                        }}
                      >
                        <label className="context-radio-label">
                          <input
                            type="radio"
                            name="context-selection"
                            checked={!useSystemContext && selectedPresetId === preset.id}
                            onChange={() => {
                              setUseSystemContext(false);
                              setSelectedPresetId(preset.id);
                              if (currentSessionId) {
                                updateSessionPreset(currentSessionId, preset.id, false);
                              }
                            }}
                            className="context-radio-input"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="context-preset-name">{preset.name}</span>
                        </label>
                        <div className="context-preset-actions">
                          <button
                            className="context-preset-edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPresetId(preset.id);
                              setUseSystemContext(false);
                              setSelectedPresetId(preset.id);
                              if (currentSessionId) {
                                updateSessionPreset(currentSessionId, preset.id, false);
                              }
                              setContextPreset({
                                name: preset.name,
                                context: preset.context || '',
                                temperature: preset.temperature?.toString() || '',
                                top_p: preset.top_p?.toString() || ''
                              });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="context-preset-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePreset(preset.id);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="context-modal-actions">
              <button className="context-btn-cancel" onClick={() => {
                setShowContextModal(false);
                setContextPreset({ name: '', context: '', temperature: '', top_p: '' });
                setEditingPresetId(null);
                setInfoTooltip(null);
              }}>
                Cancel
              </button>
              <button className="context-btn-save" onClick={() => {
                setShowContextModal(false);
                setInfoTooltip(null);
              }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
