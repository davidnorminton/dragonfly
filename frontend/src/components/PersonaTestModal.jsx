import { useState, useEffect, useRef } from 'react';
import { aiAPI } from '../services/api';

export function PersonaTestModal({ persona, isOpen, onClose }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [error, setError] = useState(null);
  const audioElementRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  console.log('[PersonaTestModal] Rendering with isOpen:', isOpen, 'persona:', persona);

  if (!isOpen || !persona) {
    console.log('[PersonaTestModal] Not rendering - isOpen:', isOpen, 'persona:', persona);
    return null;
  }

  console.log('[PersonaTestModal] Actually rendering modal content');

  // Cleanup audio on unmount only (not when audioUrl changes)
  useEffect(() => {
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on unmount, not when audioUrl changes

  // Update time display
  useEffect(() => {
    const audio = audioElementRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer('');
    setAudioUrl(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);

    // Cleanup old audio
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }

    try {
      // Ask the question with the persona context
      const response = await aiAPI.askQuestion({
        question: question.trim(),
        persona: persona.name,
        mode: 'qa'
      });

      if (response.answer) {
        setAnswer(response.answer);
        const answerText = response.answer;
        
        // Generate audio for the answer
        setAudioLoading(true);
        try {
          const audioResponse = await fetch('/api/ai/ask-audio', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              text: answerText, // Use the already-generated answer text
              persona: persona.name
            })
          });

          // Check if response is OK and is actually audio
          if (!audioResponse.ok) {
            const errorData = await audioResponse.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP ${audioResponse.status}`);
          }

          const contentType = audioResponse.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            // Backend returned JSON error instead of audio
            const errorData = await audioResponse.json();
            throw new Error(errorData.error || 'Audio generation failed');
          }

          // Get the blob
          const audioBlob = await audioResponse.blob();
          
          if (!audioBlob || audioBlob.size === 0) {
            throw new Error('Empty audio blob received');
          }
          
          const url = URL.createObjectURL(audioBlob);
          
          // Create audio element FIRST and store in ref
          const audio = new Audio(url);
          
          // Add error handler (non-blocking - don't clear audio controls)
          audio.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            console.error('Audio error details:', {
              code: audio.error?.code,
              message: audio.error?.message,
              networkState: audio.networkState,
              readyState: audio.readyState
            });
            // Don't set a blocking error - just log it
            // The audio controls should still be visible even if playback fails
          });
          
          // Wait for audio to be ready
          audio.addEventListener('canplaythrough', () => {
            console.log('[PersonaTestModal] Audio ready to play');
          });
          
          // Set ref BEFORE setting URL to ensure ref is available when component re-renders
          audioElementRef.current = audio;
          
          // Load the audio
          audio.load();
          
          // Set URL last so the component re-renders with both ref and URL set
          setAudioUrl(url);
        } catch (audioError) {
          console.error('Error generating audio:', audioError);
          setError(`Answer generated but audio generation failed: ${audioError.message || audioError}`);
        } finally {
          setAudioLoading(false);
        }
      } else {
        setError('No answer received from AI');
      }
    } catch (err) {
      console.error('Error asking question:', err);
      setError(err.message || 'Failed to get answer from AI');
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async (e) => {
    e?.stopPropagation();
    e?.preventDefault();
    
    const audio = audioElementRef.current;
    if (!audio) {
      console.error('[PersonaTestModal] No audio element available');
      return;
    }

    try {
      if (audio.paused) {
        // Check if audio is ready
        if (audio.readyState < 2) {
          console.log('[PersonaTestModal] Audio not ready, loading...');
          audio.load();
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Audio load timeout'));
            }, 10000);
            
            const onCanPlay = () => {
              clearTimeout(timeout);
              audio.removeEventListener('canplaythrough', onCanPlay);
              audio.removeEventListener('error', onError);
              resolve();
            };
            
            const onError = (e) => {
              clearTimeout(timeout);
              audio.removeEventListener('canplaythrough', onCanPlay);
              audio.removeEventListener('error', onError);
              reject(e);
            };
            
            audio.addEventListener('canplaythrough', onCanPlay);
            audio.addEventListener('error', onError);
          });
        }
        
        console.log('[PersonaTestModal] Attempting to play audio...');
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
          await playPromise;
          console.log('[PersonaTestModal] Audio playing successfully');
        }
      } else {
        audio.pause();
        console.log('[PersonaTestModal] Audio paused');
      }
    } catch (error) {
      console.error('[PersonaTestModal] Error playing audio:', error);
      
      // Show error but don't clear audio controls
      const errorMsg = error.name === 'NotAllowedError' 
        ? 'Audio playback blocked. Please interact with the page first or check browser settings.'
        : `Failed to play audio: ${error.message || error}`;
      
      // Only show error message, don't clear audioUrl or audioElementRef
      setError(errorMsg);
    }
  };

  const handleClose = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setQuestion('');
    setAnswer('');
    setAudioUrl(null);
    setError(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    onClose();
  };

  return (
    <div 
      className="modal-overlay active" 
      onClick={handleClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '20px'
      }}
    >
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a24',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <h2 style={{
            color: '#fff',
            fontSize: '1.5rem',
            fontWeight: '600',
            margin: 0
          }}>
            Test Persona: {persona.title || persona.name}
          </h2>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9da7b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.color = '#fff';
              e.target.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.color = '#9da7b8';
              e.target.style.background = 'transparent';
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: '500',
              marginBottom: '8px'
            }}>
              Ask a question:
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter your question here..."
              disabled={loading}
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1rem',
                fontFamily: 'inherit',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !question.trim()}
            style={{
              width: '100%',
              padding: '12px 24px',
              background: loading ? 'rgba(102, 126, 234, 0.5)' : 'rgba(102, 126, 234, 0.8)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (!loading && question.trim()) {
                e.target.style.background = 'rgba(102, 126, 234, 1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.target.style.background = 'rgba(102, 126, 234, 0.8)';
              }
            }}
          >
            {loading ? 'Processing...' : 'Ask Question'}
          </button>
        </form>

        {error && (
          <div style={{
            marginTop: '20px',
            padding: '12px',
            background: 'rgba(255, 107, 107, 0.1)',
            border: '1px solid rgba(255, 107, 107, 0.3)',
            borderRadius: '8px',
            color: '#ff6b6b',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        )}

        {answer && (
          <div style={{ marginTop: '24px' }}>
            <div style={{
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: '500',
              marginBottom: '12px'
            }}>
              Answer:
            </div>
            <div style={{
              padding: '16px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#e0e0e0',
              fontSize: '1rem',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word'
            }}>
              {answer}
            </div>

            {audioLoading && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                color: '#9da7b8',
                fontSize: '0.9rem',
                textAlign: 'center'
              }}>
                Generating audio...
              </div>
            )}

            {audioUrl && (
              <div style={{
                marginTop: '16px',
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '8px'
                }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handlePlay(e);
                    }}
                    type="button"
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: isPlaying ? 'rgba(22, 199, 130, 0.8)' : 'rgba(102, 126, 234, 0.8)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '1.2rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'scale(1)';
                    }}
                  >
                    {isPlaying ? '⏸' : '▶'}
                  </button>
                  <div style={{
                    flex: 1,
                    color: '#9da7b8',
                    fontSize: '0.9rem'
                  }}>
                    {isPlaying ? 'Playing...' : 'Click to play audio'}
                  </div>
                  <div style={{
                    color: '#9da7b8',
                    fontSize: '0.85rem',
                    minWidth: '80px',
                    textAlign: 'right'
                  }}>
                    {duration > 0 ? 
                      `${Math.floor(currentTime)}s / ${Math.floor(duration)}s` : 
                      'Loading...'
                    }
                  </div>
                </div>
                {duration > 0 && (
                  <div style={{
                    width: '100%',
                    height: '4px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                    marginTop: '8px'
                  }}>
                    <div style={{
                      width: `${(currentTime / duration) * 100}%`,
                      height: '100%',
                      background: isPlaying ? '#16c782' : '#667eea',
                      transition: 'width 0.1s linear'
                    }} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
