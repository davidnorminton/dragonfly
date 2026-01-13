import { useState, useEffect } from 'react';
import { SideNav } from './components/SideNav';
import { LeftPanel } from './components/LeftPanel';
import { OctopusEnergy } from './components/OctopusEnergy';
import { ApiHealth } from './components/ApiHealth';
import { PersonaModal } from './components/PersonaModal';
import { usePersonas } from './hooks/usePersonas';
import { useAudioQueue } from './hooks/useAudioQueue';
import { routerAPI, aiAPI } from './services/api';
import { MusicPage } from './pages/Music';
import { MusicEditor } from './pages/MusicEditor';
import { VideosPage } from './pages/Videos';
import { AnalyticsPage } from './pages/Analytics';
import { ChatPage } from './pages/Chat';
import { NewsPage } from './pages/News';
import { SettingsPage } from './pages/Settings';
import { AlertsPage } from './pages/Alerts';
import { UsersPage } from './pages/Users';
import { AddUserPage } from './pages/AddUser';
import { EditUserPage } from './pages/EditUser';
import { SearchOverlay } from './components/SearchOverlay';
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
  // Initialize activePage from URL or localStorage
  const [activePage, setActivePage] = useState(() => {
    // Check URL hash first
    const hash = window.location.hash.slice(1);
    if (hash && ['dashboard', 'chat', 'music', 'videos', 'news', 'settings', 'alerts', 'users', 'add-user', 'edit-user', 'analytics', 'music-editor'].includes(hash)) {
      return hash;
    }
    // Fallback to localStorage
    const stored = localStorage.getItem('activePage');
    return stored || 'dashboard';
  });
  const [pageData, setPageData] = useState(null); // For passing data to pages like edit-user
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [showLeft, setShowLeft] = useState(true);
  const [selectedUser, setSelectedUser] = useState(() => {
    // Load selected user from localStorage if available
    const stored = localStorage.getItem('selectedUser');
    return stored ? JSON.parse(stored) : null;
  });
  
  // Persist selected user to localStorage
  useEffect(() => {
    if (selectedUser) {
      localStorage.setItem('selectedUser', JSON.stringify(selectedUser));
    } else {
      localStorage.removeItem('selectedUser');
    }
  }, [selectedUser]);

  // Listen for user updates and refresh selectedUser if it's the same user
  useEffect(() => {
    const handleUserUpdate = (event) => {
      const updatedUser = event.detail;
      if (selectedUser && selectedUser.id === updatedUser.id) {
        console.log('Updating selected user with new data:', updatedUser);
        setSelectedUser(updatedUser);
      }
    };
    
    window.addEventListener('userUpdated', handleUserUpdate);
    return () => window.removeEventListener('userUpdated', handleUserUpdate);
  }, [selectedUser]);

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && ['dashboard', 'chat', 'music', 'videos', 'news', 'settings', 'alerts', 'users', 'add-user', 'edit-user', 'analytics', 'music-editor'].includes(hash)) {
        setActivePage(hash);
        localStorage.setItem('activePage', hash);
        setSearchOverlayOpen(false);
      }
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  const [musicSearchQuery, setMusicSearchQuery] = useState('');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [musicSearchResults, setMusicSearchResults] = useState([]);
  const [chatSearchResults, setChatSearchResults] = useState([]);
  const [videoSearchResults, setVideoSearchResults] = useState([]);
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
    
    if (newState) {
      // Entering focus mode - pause music and other audio
      // Dispatch event for music player to pause (and remember state)
      window.dispatchEvent(new CustomEvent('enterFocusMode'));
      
      // Stop all other audio elements on the page (including in iframes)
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
    } else {
      // Exiting focus mode - resume music if it was playing
      window.dispatchEvent(new CustomEvent('exitFocusMode'));
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
      <SideNav
        activePage={activePage}
        onNavigate={(page) => {
          setActivePage(page);
          // Update URL hash
          window.location.hash = page;
          // Save to localStorage
          localStorage.setItem('activePage', page);
          // Close search overlay when navigating
          setSearchOverlayOpen(false);
        }}
        onSwitchAI={handleSwitchAI}
        onSettingsClick={() => {
          setActivePage('settings');
          window.location.hash = 'settings';
          localStorage.setItem('activePage', 'settings');
          setSearchOverlayOpen(false);
        }}
        onAiFocusClick={toggleAiFocus}
        selectedUser={selectedUser}
        onSearchClick={() => setSearchOverlayOpen(true)}
      />
      {activePage === 'music' ? (
        <MusicPage 
          sessionId={sessionId}
          audioQueue={audioQueue}
          onMicClick={toggleAiFocus}
          searchQuery={musicSearchQuery}
          onSearchResultsChange={setMusicSearchResults}
          selectedUser={selectedUser}
        />
      ) : activePage === 'music-editor' ? (
        <MusicEditor />
      ) : activePage === 'videos' ? (
        <VideosPage
          searchQuery={videoSearchQuery}
          onSearchResultsChange={setVideoSearchResults}
          onGenreClick={(genre) => {
            setVideoSearchQuery(genre);
            setSearchOverlayOpen(true);
          }}
        />
      ) : activePage === 'analytics' ? (
        <AnalyticsPage />
      ) : activePage === 'chat' ? (
        <ChatPage 
          sessionId={sessionId}
          onMicClick={toggleAiFocus}
          searchQuery={chatSearchQuery}
          onSearchResultsChange={setChatSearchResults}
          selectedUser={selectedUser}
        />
      ) : activePage === 'news' ? (
        <NewsPage />
      ) : activePage === 'settings' ? (
        <SettingsPage onNavigate={(page) => {
          setActivePage(page);
          window.location.hash = page;
          localStorage.setItem('activePage', page);
          setSearchOverlayOpen(false);
        }} />
      ) : activePage === 'alerts' ? (
        <AlertsPage />
      ) : activePage === 'users' ? (
        <UsersPage 
          key={`users-${Date.now()}`}
          onNavigate={(page, data) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setPageData(data);
            setSearchOverlayOpen(false);
          }}
          selectedUser={selectedUser}
          onSelectUser={setSelectedUser}
        />
      ) : activePage === 'add-user' ? (
        <AddUserPage onNavigate={(page, data) => {
          setActivePage(page);
          window.location.hash = page;
          localStorage.setItem('activePage', page);
          setPageData(data);
          setSearchOverlayOpen(false);
        }} />
      ) : activePage === 'edit-user' ? (
        <EditUserPage 
          onNavigate={(page, data) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setPageData(data);
            setSearchOverlayOpen(false);
          }} 
          user={pageData}
        />
      ) : (
        <div className="main-container">
          {showLeft && (
            <div className="left-section">
              <LeftPanel />
            </div>
          )}
          <div className="right-section">
            <OctopusEnergy />
            <ApiHealth />
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
      {/* Search Overlay */}
      {searchOverlayOpen && (activePage === 'chat' || activePage === 'music' || activePage === 'videos') && (
        <SearchOverlay
          activePage={activePage}
          onClose={() => {
            setSearchOverlayOpen(false);
            // Clear search query when closing
            if (activePage === 'music') setMusicSearchQuery('');
            if (activePage === 'chat') setChatSearchQuery('');
            if (activePage === 'videos') setVideoSearchQuery('');
          }}
          searchQuery={
            activePage === 'music' ? musicSearchQuery :
            activePage === 'chat' ? chatSearchQuery :
            activePage === 'videos' ? videoSearchQuery : ''
          }
          onSearchChange={(query) => {
            if (activePage === 'music') setMusicSearchQuery(query);
            if (activePage === 'chat') setChatSearchQuery(query);
            if (activePage === 'videos') setVideoSearchQuery(query);
          }}
          selectedUser={selectedUser}
        />
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
