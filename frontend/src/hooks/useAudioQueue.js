import { useState, useRef, useEffect, useCallback } from 'react';
import { audioAPI } from '../services/api';

/**
 * Custom hook for managing an audio playback queue.
 * Queues AI answers and auto-plays them sequentially.
 */
export function useAudioQueue() {
  const [queue, setQueue] = useState([]); // Array of { messageId, text, persona }
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const audioRef = useRef(null);
  const sessionIdRef = useRef(null);
  const queueRef = useRef([]);
  const currentIndexRef = useRef(-1);
  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);

  // Sync refs with state
  useEffect(() => {
    queueRef.current = queue;
    currentIndexRef.current = currentIndex;
    isPlayingRef.current = isPlaying;
    isPausedRef.current = isPaused;
  }, [queue, currentIndex, isPlaying, isPaused]);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.preload = 'none';
    
    const handleTimeUpdate = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
    };
    
    const handleDurationChange = () => {
      if (audioRef.current) {
        setDuration(audioRef.current.duration || 0);
      }
    };
    
    const handleEnded = () => {
      // Move to next item in queue
      if (!isPausedRef.current && isPlayingRef.current) {
        setCurrentIndex(prev => {
          const nextIndex = prev + 1;
          if (nextIndex >= queueRef.current.length) {
            // Queue finished
            setIsPlaying(false);
            setCurrentAudioUrl(null);
            setIsGenerating(false);
            setCurrentTime(0);
            return -1;
          }
          return nextIndex;
        });
      }
    };
    
    const handleError = (e) => {
      console.error('Audio playback error:', e);
      setIsGenerating(false);
      setIsPlaying(false);
      // Move to next item even on error
      if (!isPausedRef.current) {
        setCurrentIndex(prev => {
          const nextIndex = prev + 1;
          if (nextIndex >= queueRef.current.length) {
            setIsPlaying(false);
            setCurrentAudioUrl(null);
            setIsGenerating(false);
            setCurrentTime(0);
            return -1;
          }
          return nextIndex;
        });
      }
    };
    
    audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
    audioRef.current.addEventListener('durationchange', handleDurationChange);
    audioRef.current.addEventListener('ended', handleEnded);
    audioRef.current.addEventListener('error', handleError);
    
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
        audioRef.current.removeEventListener('durationchange', handleDurationChange);
        audioRef.current.removeEventListener('ended', handleEnded);
        audioRef.current.removeEventListener('error', handleError);
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Get session ID from localStorage
  useEffect(() => {
    const updateSessionId = () => {
      sessionIdRef.current = localStorage.getItem('chatSessionId') || 'default';
    };
    updateSessionId();
    // Also check periodically
    const interval = setInterval(updateSessionId, 1000);
    return () => clearInterval(interval);
  }, []);

  // Play current item in queue
  const playCurrentItem = useCallback(async () => {
    const idx = currentIndexRef.current;
    const q = queueRef.current;
    
    if (idx < 0 || idx >= q.length || !isPlayingRef.current || isPausedRef.current) {
      return;
    }
    
    const item = q[idx];
    if (!item || !item.messageId) return;
    
    setIsGenerating(true);
    
    try {
      // Generate audio for this message
      const data = await audioAPI.generateAudioForMessage(sessionIdRef.current, item.messageId);
      
      if (data.success && data.audio_url) {
        const audioUrl = data.audio_url.startsWith('/') ? data.audio_url : `/${data.audio_url}`;
        setCurrentAudioUrl(audioUrl);
        
        // Load and play audio
        if (audioRef.current && isPlayingRef.current && !isPausedRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.load();
          
          // Wait for audio to be ready
          await new Promise((resolve, reject) => {
            const audio = audioRef.current;
            if (!audio) {
              reject(new Error('Audio element not found'));
              return;
            }
            
            const handleCanPlay = () => {
              audio.removeEventListener('canplay', handleCanPlay);
              audio.removeEventListener('error', handleError);
              audio.removeEventListener('loadeddata', handleCanPlay);
              resolve();
            };
            
            const handleError = (e) => {
              audio.removeEventListener('canplay', handleCanPlay);
              audio.removeEventListener('error', handleError);
              audio.removeEventListener('loadeddata', handleCanPlay);
              reject(new Error(`Audio load error: ${audio.error?.message || 'Unknown error'}`));
            };
            
            audio.addEventListener('canplay', handleCanPlay, { once: true });
            audio.addEventListener('loadeddata', handleCanPlay, { once: true });
            audio.addEventListener('error', handleError, { once: true });
            
            if (audio.readyState >= 2) {
              handleCanPlay();
            }
          });
          
          try {
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
              await playPromise;
              setIsGenerating(false);
            }
          } catch (playError) {
            console.error('Error playing audio:', playError);
            setIsGenerating(false);
            // Move to next item even on play error
            setCurrentIndex(prev => {
              const nextIndex = prev + 1;
              if (nextIndex >= queueRef.current.length) {
                setIsPlaying(false);
                setCurrentAudioUrl(null);
                return -1;
              }
              return nextIndex;
            });
          }
        }
      } else {
        console.error('Failed to generate audio:', data.error);
        setIsGenerating(false);
        // Move to next item even on error
        setCurrentIndex(prev => {
          const nextIndex = prev + 1;
          if (nextIndex >= queueRef.current.length) {
            setIsPlaying(false);
            setCurrentAudioUrl(null);
            return -1;
          }
          return nextIndex;
        });
      }
    } catch (error) {
      console.error('Error generating/playing audio:', error);
      setIsGenerating(false);
      // Move to next item even on error
      setCurrentIndex(prev => {
        const nextIndex = prev + 1;
        if (nextIndex >= queueRef.current.length) {
          setIsPlaying(false);
          setCurrentAudioUrl(null);
          return -1;
        }
        return nextIndex;
      });
    }
  }, []);

  // Trigger playback when currentIndex changes and we should be playing
  useEffect(() => {
    if (currentIndex >= 0 && currentIndex < queue.length && isPlaying && !isPaused) {
      playCurrentItem();
    }
  }, [currentIndex, isPlaying, isPaused, queue.length, playCurrentItem]);

  const addToQueue = useCallback((messageId, text, persona = null) => {
    if (!messageId) {
      console.warn('Cannot add message to queue: messageId is required');
      return;
    }
    
    setQueue(prev => {
      // Check if messageId already in queue
      if (prev.some(item => item.messageId === messageId)) {
        return prev; // Already in queue
      }
      
      const newQueue = [...prev, { messageId, text, persona }];
      
      // If not currently playing and not paused, start playing
      if (!isPlayingRef.current && !isPausedRef.current) {
        setTimeout(() => {
          setCurrentIndex(0);
          setIsPlaying(true);
        }, 100);
      }
      
      return newQueue;
    });
  }, []);

  const startQueue = useCallback(() => {
    setIsPaused(false);
    setQueue(q => {
      if (q.length > 0) {
        setCurrentIndex(prevIdx => prevIdx < 0 ? 0 : prevIdx);
        setIsPlaying(true);
      }
      return q;
    });
  }, []);

  const stopQueue = useCallback(() => {
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentIndex(-1);
    setCurrentAudioUrl(null);
    setIsGenerating(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
    }
  }, []);

  const seekTo = useCallback((time) => {
    if (audioRef.current && duration > 0) {
      audioRef.current.currentTime = Math.max(0, Math.min(time, duration));
      setCurrentTime(audioRef.current.currentTime);
    }
  }, [duration]);

  const pauseQueue = useCallback(() => {
    setIsPaused(true);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  const clearQueue = useCallback(() => {
    stopQueue();
    setQueue([]);
  }, [stopQueue]);

  return {
    queue,
    currentIndex,
    isPlaying,
    isPaused,
    isGenerating,
    currentAudioUrl,
    currentTime,
    duration,
    addToQueue,
    startQueue,
    stopQueue,
    pauseQueue,
    clearQueue,
    seekTo,
    queueLength: queue.length,
  };
}
