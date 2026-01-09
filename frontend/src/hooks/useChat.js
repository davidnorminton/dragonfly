import { useState, useEffect, useRef, useCallback } from 'react';
import { chatAPI } from '../services/api';

export function useChat(sessionId, mode, persona) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const offsetRef = useRef(0);
  
  // Keep ref in sync with state
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const loadHistory = useCallback(async (resetOffset = true) => {
    try {
      setLoading(true);
      const currentOffset = resetOffset ? 0 : offsetRef.current;
      const data = await chatAPI.getHistory(50, currentOffset, sessionId, mode, persona);
      if (resetOffset) {
        setMessages(data.messages || []);
        const newOffset = data.messages?.length || 0;
        setOffset(newOffset);
      } else {
        setMessages(prev => [...(data.messages || []), ...prev]);
        setOffset(prev => prev + (data.messages?.length || 0));
      }
      setHasMore(data.has_more || false);
      setLoading(false);
      return data.messages || [];
    } catch (error) {
      console.error('Error loading chat history:', error);
      setLoading(false);
      return [];
    }
  }, [sessionId, mode, persona]); // Removed offset from dependencies to prevent infinite loop

  const reloadHistory = useCallback(async () => {
    setOffset(0);
    setHasMore(true);
    setLoading(true);
    try {
      const data = await chatAPI.getHistory(50, 0, sessionId, mode, persona);
      setMessages(data.messages || []);
      setHasMore((data.messages?.length || 0) === 50);
    } catch (error) {
      console.error('Error loading chat history:', error);
      // Don't clear messages on error - keep what we have
    } finally {
      setLoading(false);
    }
  }, [sessionId, mode, persona]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      // Use functional update to get current offset value
      setOffset(currentOffset => {
        chatAPI.getHistory(50, currentOffset, sessionId, mode, persona).then(data => {
          if (data.messages && data.messages.length > 0) {
            setMessages(prev => [...(data.messages || []), ...prev]);
            setHasMore(data.has_more || false);
          } else {
            setHasMore(false);
          }
          setIsLoadingMore(false);
        }).catch(error => {
          console.error('Error loading more chat:', error);
          setIsLoadingMore(false);
        });
        return currentOffset; // Return unchanged, will update after promise resolves
      });
      // Update offset after getting the data
      setOffset(prev => {
        // This will be updated in the promise above
        return prev;
      });
    } catch (error) {
      console.error('Error loading more chat:', error);
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, sessionId, mode, persona]);

  const sendMessage = async (text, onChunk, onComplete, onError, mode = 'qa', expertType = 'general') => {
    try {
      const response = await chatAPI.sendMessage(text, sessionId, mode, expertType);
      if (!response.ok) throw new Error('Failed to send message');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';
      let finalMessageId = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.chunk) {
                fullResponse += data.chunk;
                onChunk?.(fullResponse);
              }
              if (data.done) {
                finalMessageId = data.message_id;
                onComplete?.(fullResponse, finalMessageId);
                // No need to call loadHistory here, it's handled by the useEffect in Chat.jsx
                return fullResponse;
              }
              if (data.error) {
                onError?.(data.error);
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
      onError?.(error.message);
      throw error;
    }
  };

  useEffect(() => {
    console.log('[useChat] useEffect triggered - sessionId:', sessionId, 'mode:', mode, 'persona:', persona);
    
    // If no sessionId, don't load anything
    if (!sessionId) {
      setMessages([]);
      setLoading(false);
      setHasMore(false);
      setOffset(0);
      offsetRef.current = 0;
      return;
    }
    
    // Clear messages immediately when session changes
    setMessages([]);
    setLoading(true);
    setOffset(0);
    setHasMore(true);
    offsetRef.current = 0;
    
    // Load history for the new session
    const loadData = async () => {
      try {
        console.log('[useChat] Loading history for sessionId:', sessionId, 'mode:', mode, 'persona:', persona);
        // For chat sessions, only pass sessionId (backend will filter by session_id only)
        // For other sessions, pass mode and persona
        const data = sessionId && sessionId.startsWith('chat-') 
          ? await chatAPI.getHistory(50, 0, sessionId, null, null)
          : await chatAPI.getHistory(50, 0, sessionId, mode, persona);
        console.log('[useChat] Loaded messages:', data.messages?.length || 0, 'for sessionId:', sessionId);
        setMessages(data.messages || []);
        const newOffset = data.messages?.length || 0;
        setOffset(newOffset);
        offsetRef.current = newOffset;
        setHasMore(data.has_more || false);
        setLoading(false);
      } catch (error) {
        console.error('[useChat] Error loading chat history:', error);
        setLoading(false);
      }
    };
    
    loadData();
  }, [sessionId, mode, persona]); // Inline load logic to avoid dependency issues

  return { messages, loading, hasMore, isLoadingMore, loadHistory, loadMore, sendMessage, reloadHistory };
}
