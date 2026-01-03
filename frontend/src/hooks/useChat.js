import { useState, useEffect, useRef } from 'react';
import { chatAPI } from '../services/api';

export function useChat(sessionId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadHistory = async (resetOffset = true) => {
    try {
      const currentOffset = resetOffset ? 0 : offset;
      const data = await chatAPI.getHistory(50, currentOffset);
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
  };

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const data = await chatAPI.getHistory(50, offset);
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

  const sendMessage = async (text, onChunk, onComplete, onError) => {
    try {
      const response = await chatAPI.sendMessage(text, sessionId);
      if (!response.ok) throw new Error('Failed to send message');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';

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
                onComplete?.(fullResponse);
                await loadHistory(true);
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
  }, [sessionId]);

  return { messages, loading, hasMore, isLoadingMore, loadHistory, loadMore, sendMessage };
}

