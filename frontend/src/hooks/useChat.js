import { useState, useEffect, useRef, useCallback } from 'react';
import { chatAPI } from '../services/api';

export function useChat(sessionId, mode, persona) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadHistory = useCallback(async (resetOffset = true) => {
    try {
      const currentOffset = resetOffset ? 0 : offset;
      const data = await chatAPI.getHistory(50, currentOffset, sessionId, mode, persona);
      if (resetOffset) {
        setMessages(data.messages || []);
        setOffset(data.messages?.length || 0);
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
  }, [offset, sessionId, mode, persona]);

  const reloadHistory = useCallback(async () => {
    setMessages([]);
    setOffset(0);
    setHasMore(true);
    setLoading(true);
    try {
      const data = await chatAPI.getHistory(50, 0, sessionId, mode, persona);
      if (data.messages) {
        setMessages(data.messages.reverse());
        setHasMore(data.messages.length === 50);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      setLoading(false);
    }
  }, [sessionId, mode, persona]);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const data = await chatAPI.getHistory(50, offset, sessionId, mode, persona);
      if (data.messages && data.messages.length > 0) {
        setMessages(prev => [...(data.messages || []), ...prev]);
        setOffset(prev => prev + data.messages.length);
        setHasMore(data.has_more || false);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more chat:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

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
    loadHistory(true);
  }, [sessionId, mode, persona, loadHistory]);

  return { messages, loading, hasMore, isLoadingMore, loadHistory, loadMore, sendMessage, reloadHistory };
}
