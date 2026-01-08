import { useState, useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { OctopusEnergy } from './components/OctopusEnergy';
import { PersonaModal } from './components/PersonaModal';
import { usePersonas } from './hooks/usePersonas';
import { useAudioQueue } from './hooks/useAudioQueue';
import { routerAPI, aiAPI } from './services/api';
import { MusicPage } from './pages/Music';
import { MusicEditor } from './pages/MusicEditor';
import { AnalyticsPage } from './pages/Analytics';
import { ChatPage } from './pages/Chat';
import { NewsPage } from './pages/News';
import { SettingsPage } from './pages/Settings';
import { WaveformMic } from './components/WaveformMic';
import './styles/index.css';

function App() {
  const [sessionId, setSessionId] = useState(() => {
    const stored = localStorage.getItem('chatSessionId');
    if (stored) return stored;
    const newId = `session-${Date.now()}`;
    localStorage.setItem('chatSessionId', newId);
    return newId;
  });
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [aiFocusActive, setAiFocusActive] = useState(false);
  const [micStream, setMicStream] = useState(null);
  const [micStatus, setMicStatus] = useState('idle'); // idle | listening | processing | playing | error
  const [micError, setMicError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [routerText, setRouterText] = useState('');
  const [aiResponseText, setAiResponseText] = useState(''); // Display AI response text immediately
  const [audioObj, setAudioObj] = useState(null);
  const [fillerAudioObj, setFillerAudioObj] = useState(null); // Filler audio for immediate feedback
  const [micRestartKey, setMicRestartKey] = useState(0);
  const [aiFocusMode, setAiFocusMode] = useState('question'); // 'question' or 'task'
  const [activePage, setActivePage] = useState('dashboard');
  const [showLeft, setShowLeft] = useState(true);
  const [musicSearchQuery, setMusicSearchQuery] = useState('');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const { selectPersona, currentTitle } = usePersonas();
  const audioQueue = useAudioQueue();

  useEffect(() => {
    // Initialize session ID in localStorage if not present
    if (!localStorage.getItem('chatSessionId')) {
      localStorage.setItem('chatSessionId', sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    // Clean up audio on unmount or audio change
    return () => {
      if (audioObj) {
        audioObj.pause();
      }
    };
  }, [audioObj]);



  const handleSwitchAI = () => {
    setPersonaModalOpen(true);
  };

  const handlePersonaSelect = async (personaName) => {
    await selectPersona(personaName);
    setPersonaModalOpen(false);
  };

  const toggleAiFocus = () => {
    const newState = !aiFocusActive;
    setAiFocusActive(newState);
    
    // Stop all music/audio when entering focus mode
    if (newState) {
      // Stop all audio elements on the page (including in iframes)
      const allAudioElements = document.querySelectorAll('audio');
      allAudioElements.forEach((audio) => {
        try {
          if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
          }
        } catch (e) {
          console.warn('Error stopping audio:', e);
        }
      });
      
      // Also stop any audio objects in state
      if (audioObj) {
        try {
          audioObj.pause();
          audioObj.currentTime = 0;
        } catch (e) {
          console.warn('Error stopping audioObj:', e);
        }
      }
      if (fillerAudioObj) {
        try {
          fillerAudioObj.pause();
          fillerAudioObj.currentTime = 0;
        } catch (e) {
          console.warn('Error stopping fillerAudioObj:', e);
        }
      }
      
      // Dispatch custom event to stop music player
      window.dispatchEvent(new CustomEvent('stopAllAudio'));
      
      // Also try to stop any HTMLAudioElement instances
      setTimeout(() => {
        const allAudio = document.querySelectorAll('audio');
        allAudio.forEach((audio) => {
          try {
            audio.pause();
            audio.currentTime = 0;
          } catch (e) {
            // Ignore errors
          }
        });
      }, 100);
    }
  };

  // Play filler audio for immediate feedback
  const playFillerAudio = async () => {
    try {
      console.log('[FILLER] Requesting filler audio...');
      const fillerResp = await aiAPI.getFillerAudio();
      const blob = fillerResp?.data;
      
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        const filler = new Audio(url);
        setFillerAudioObj(filler);
        
        filler.onended = () => {
          console.log('[FILLER] Filler audio ended');
          setFillerAudioObj(null);
        };
        
        await filler.play();
        console.log('[FILLER] Playing filler audio');
      }
    } catch (err) {
      console.error('[FILLER] Failed to play filler audio:', err);
    }
  };

  // Stop filler audio when real audio is ready
  const stopFillerAudio = () => {
    if (fillerAudioObj) {
      console.log('[FILLER] Stopping filler audio');
      fillerAudioObj.pause();
      fillerAudioObj.currentTime = 0;
      setFillerAudioObj(null);
    }
  };

  const beginListening = () => {
    // Ensure overlay is open
    if (!aiFocusActive) {
      setAiFocusActive(true);
    }
    // Only start if not already capturing/playing
    if (!['listening', 'processing', 'playing'].includes(micStatus)) {
      setMicStatus('listening');
      setMicRestartKey((k) => k + 1);
    }
  };

  // Manage microphone capture in AI focus mode
  useEffect(() => {
    let cancelled = false;
    let mediaRecorder;
    let analyser;
    let audioContext;
    let silenceStart = 0;
    let silenceTimer;
    let chunks = [];

    const stopRecording = async () => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    };

    const startMic = async () => {
      setMicError('');
      setTranscript('');
      setAiResponseText('Listening...');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setMicStream(stream);

        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        mediaRecorder = new MediaRecorder(stream);
        chunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        mediaRecorder.onstop = async () => {
          if (chunks.length === 0) return;
          
          // Play filler audio immediately while transcription happens
          playFillerAudio();
          
          const blob = new Blob(chunks, { type: 'audio/webm' });
          await sendForTranscription(blob);
        };
        mediaRecorder.start();

        const detectSilence = () => {
          const buffer = new Uint8Array(analyser.fftSize);
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            const v = (buffer[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buffer.length);
          // Increase threshold slightly to ignore more background noise
          const threshold = 0.04; // silence threshold
          const now = performance.now();

          if (rms < threshold) {
            if (silenceStart === 0) silenceStart = now;
            if (now - silenceStart > 2000) {
              stopRecording();
              return;
            }
          } else {
            silenceStart = 0;
          }
          silenceTimer = requestAnimationFrame(detectSilence);
        };
        silenceTimer = requestAnimationFrame(detectSilence);
      } catch (err) {
        setMicStatus('error');
        setMicError(err?.message || 'Microphone access denied');
      }
    };

    const sendForTranscription = async (blob) => {
      setMicStatus('processing');
      try {
        const fd = new FormData();
        fd.append('file', blob, 'audio.webm');
        const resp = await fetch('/api/transcribe', {
          method: 'POST',
          body: fd,
        });
        const data = await resp.json();
        console.log('Transcribe response', data);
        if (data.router_model || data.router_prompt || data.router_input) {
          console.log('Router meta', {
            model: data.router_model,
            prompt: data.router_prompt,
            input: data.router_input,
            output_raw: data.router_answer,
            output_parsed: data.router_parsed,
            error: data.router_error,
          });
        }
        if (data.success) {
          const transcript = data.transcript || '';
          console.log('Transcript:', transcript);
          
          // Show thinking status while AI processes
          setAiResponseText('Thinking...');
          
          // Handle based on AI focus mode
          if (aiFocusMode === 'question') {
            // Direct AI question mode - stream text first, then audio
            try {
              console.log('[QUESTION MODE] Starting streaming pipeline...');
              const startTime = Date.now();
              
              let responseText = '';
              let firstTextChunk = null;
              let firstAudioChunk = null;
              
              // Step 1: Stream text from AI and display it
              console.log('[STREAM] Streaming text response...');
              
              await aiAPI.askQuestionStream({ question: transcript }, (data) => {
                if (data.chunk) {
                  if (firstTextChunk === null) {
                    firstTextChunk = Date.now() - startTime;
                    console.log(`[STREAM] First text chunk in ${firstTextChunk}ms`);
                  }
                  responseText += data.chunk;
                  setAiResponseText(responseText);
                } else if (data.done) {
                  const textTime = Date.now() - startTime;
                  console.log(`[STREAM] Text complete in ${textTime}ms, length: ${responseText.length}`);
                  responseText = data.full_text || responseText;
                  setAiResponseText(responseText);
                }
              });
              
              // Step 2: Now generate streaming audio from the completed text
              if (responseText) {
                console.log('[STREAM] Starting audio generation from completed text...');
                const audioStartTime = Date.now();
                
                const response = await fetch('/api/ai/text-to-audio-stream', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: responseText })
                });
                
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                console.log('[STREAM] Audio stream started');
                
                // Create audio element with MediaSource for streaming playback
                const mediaSource = new MediaSource();
                const audio = new Audio();
                audio.src = URL.createObjectURL(mediaSource);
                setAudioObj(audio);
                
                let sourceBuffer = null;
                let audioStarted = false;
                const audioQueue = [];
                let isAppending = false;
                
                mediaSource.addEventListener('sourceopen', async () => {
                  console.log('[STREAM] MediaSource opened');
                  sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
                  
                  sourceBuffer.addEventListener('updateend', () => {
                    isAppending = false;
                    // Process next chunk in queue
                    if (audioQueue.length > 0 && !isAppending) {
                      isAppending = true;
                      const nextChunk = audioQueue.shift();
                      sourceBuffer.appendBuffer(nextChunk);
                    } else if (audioQueue.length === 0 && mediaSource.readyState === 'open') {
                      // Check if stream is complete
                      if (response.body.locked) {
                        // Still reading, wait for more
                      } else {
                        mediaSource.endOfStream();
                      }
                    }
                  });
                  
                  // Read stream chunks
                  const reader = response.body.getReader();
                  let totalBytes = 0;
                  
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                      console.log(`[STREAM] Audio stream complete, total: ${totalBytes} bytes`);
                      // Wait for queue to empty before ending stream
                      if (audioQueue.length === 0 && !isAppending && mediaSource.readyState === 'open') {
                        mediaSource.endOfStream();
                      }
                      break;
                    }
                    
                    if (firstAudioChunk === null) {
                      firstAudioChunk = Date.now() - startTime;
                      console.log(`[STREAM] First audio chunk in ${firstAudioChunk}ms`);
                      stopFillerAudio();
                      setMicStatus('playing');
                    }
                    
                    totalBytes += value.length;
                    
                    // Add to queue or append directly
                    if (isAppending || audioQueue.length > 0) {
                      audioQueue.push(value);
                    } else {
                      isAppending = true;
                      sourceBuffer.appendBuffer(value);
                    }
                    
                    // Start playback as soon as we have some data
                    if (!audioStarted && totalBytes > 8192) { // Wait for ~8KB
                      audioStarted = true;
                      try {
                        await audio.play();
                        console.log(`[STREAM] Audio playback started in ${Date.now() - startTime}ms`);
                      } catch (playErr) {
                        console.error('[STREAM] Audio play failed:', playErr);
                      }
                    }
                  }
                });
                
                audio.onended = () => {
                  console.log('[STREAM] Audio ended');
                  setMicStatus('idle');
                  setAiResponseText('');
                  URL.revokeObjectURL(audio.src);
                };
                
                audio.onerror = (err) => {
                  console.error('[STREAM] Audio error:', err, audio.error);
                  setMicStatus('idle');
                  setAiResponseText('');
                };
                
              } else {
                console.log('[STREAM] No text to generate audio from');
                setMicStatus('idle');
              }
            } catch (err) {
              console.error('[STREAM] Streaming failed:', err);
              stopFillerAudio();
              setMicStatus('idle');
              setAiResponseText('');
            }
          } else {
            // Task mode - use router (to be implemented)
            console.log('[TASK MODE] Using router...');
            stopFillerAudio(); // Stop filler for task mode
            const routedParsed = data.router_parsed;
            const routedRaw = data.router_answer;
            const routedError = data.router_error;
            const fallback = transcript;
            const routerDisplay =
              (routedParsed && (routedParsed.value || routedParsed.type || JSON.stringify(routedParsed))) ||
              (routedRaw && routedRaw.trim()) ||
              (routedError && `Router error: ${routedError}`) ||
              '(no router output)';
            console.log('Router display:', routerDisplay);
            
            // For now, just show a message that task mode isn't implemented yet
            setAiResponseText('Task mode is not yet implemented. Please use Question mode.');
            setMicStatus('idle');
          }

          // Keep transcript/router info only in console (no UI)
          setTranscript('');
          setRouterText('');
        } else {
          // Stay in listening mode on no transcript/error
          console.warn('Transcription failed or empty; continuing to listen', data.error);
          setMicStatus('listening');
          setMicError(data.error || 'Transcription failed');
          setMicRestartKey((k) => k + 1);
        }
      } catch (err) {
        console.error('Transcription failed', err);
        setMicStatus('idle');
        setMicError(err?.message || 'Transcription failed');
      }
    };
    if (aiFocusActive && micStatus === 'listening') {
      startMic();
    } else {
      // stop mic
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
        setMicStream(null);
      }
      setMicStatus('idle');
      setMicError('');
      setTranscript('');
      setRouterText('');
      if (silenceTimer) cancelAnimationFrame(silenceTimer);
      if (audioContext) audioContext.close().catch(() => {});
    }

    return () => {
      cancelled = true;
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
      }
      if (silenceTimer) cancelAnimationFrame(silenceTimer);
      if (audioContext) audioContext.close().catch(() => {});
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    };
    // Depend on micRestartKey to allow restarting listening after retries
  }, [aiFocusActive, micRestartKey, micStatus]);


  return (
    <div className={`app-shell ${aiFocusActive ? 'ai-focus' : ''}`}>
      <TopBar 
        onSwitchAI={handleSwitchAI}
        onSettingsClick={() => setActivePage('settings')}
        onAiFocusClick={toggleAiFocus}
        activePage={activePage}
        onNavigate={(page) => setActivePage(page)}
        onMusicSearch={(query) => setMusicSearchQuery(query)}
        onChatSearch={(query) => setChatSearchQuery(query)}
      />
      {activePage === 'music' ? (
        <MusicPage 
          sessionId={sessionId}
          audioQueue={audioQueue}
          onMicClick={toggleAiFocus}
          searchQuery={musicSearchQuery}
        />
      ) : activePage === 'music-editor' ? (
        <MusicEditor />
      ) : activePage === 'analytics' ? (
        <AnalyticsPage />
      ) : activePage === 'chat' ? (
        <ChatPage 
          sessionId={sessionId}
          onMicClick={toggleAiFocus}
          searchQuery={chatSearchQuery}
        />
      ) : activePage === 'news' ? (
        <NewsPage />
      ) : activePage === 'settings' ? (
        <SettingsPage onNavigate={(page) => setActivePage(page)} />
      ) : (
        <div className="main-container">
          {showLeft && (
            <div className="left-section">
              <LeftPanel />
            </div>
          )}
          <div className="right-section">
            <OctopusEnergy />
          </div>
        </div>
      )}
      {!showLeft && (
        <div
          className="collapse-toggle collapse-left"
          onClick={() => setShowLeft(true)}
          title="Show news and widgets"
        >
          ▶
        </div>
      )}
      <PersonaModal 
        open={personaModalOpen}
        onClose={() => setPersonaModalOpen(false)}
        onSelect={handlePersonaSelect}
      />
      {aiFocusActive && (
        <div className="ai-focus-overlay">
          <div className="ai-focus-persona-name">
            {currentTitle || 'AI Assistant'}
          </div>
          <div
            className={`ai-focus-mic ${
              ['listening', 'processing', 'playing'].includes(micStatus) ? 'active' : 'off'
            }`}
            role="button"
            tabIndex={0}
            onClick={beginListening}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && beginListening()}
            title="Start microphone"
          >
            <WaveformMic status={micStatus} />
          </div>
          <div className="ai-focus-status">
            {micStatus === 'listening' && 'Listening...'}
            {micStatus === 'error' && `Mic error: ${micError}`}
            {micStatus === 'processing' && 'Transcribing...'}
            {micStatus === 'playing' && 'Playing response...'}
            {micStatus === 'idle' && 'Tap mic to start'}
          </div>
          <div className="ai-focus-mode-toggle">
            <button
              className={aiFocusMode === 'question' ? 'active' : ''}
              onClick={() => setAiFocusMode('question')}
              disabled={micStatus !== 'idle'}
            >
              Question
            </button>
            <button
              className={aiFocusMode === 'task' ? 'active' : ''}
              onClick={() => setAiFocusMode('task')}
              disabled={micStatus !== 'idle'}
            >
              Task
            </button>
          </div>
          {aiResponseText && (
            <div className="ai-response-text">
              {aiResponseText}
            </div>
          )}
          <button
            className="ai-focus-exit"
            onClick={toggleAiFocus}
            title="Exit AI Focus Mode"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
