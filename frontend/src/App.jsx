import { useState, useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { CenterPanel } from './components/CenterPanel';
import { Chat } from './components/Chat';
import { PanelResizer } from './components/PanelResizer';
import { PersonaModal } from './components/PersonaModal';
import { Settings } from './components/Settings';
import { usePersonas } from './hooks/usePersonas';
import { useAudioQueue } from './hooks/useAudioQueue';
import { routerAPI } from './services/api';
import { MusicPage } from './pages/Music';
import { MusicEditor } from './pages/MusicEditor';
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
  const [audioUrl, setAudioUrl] = useState(null);
  const [leftWidth, setLeftWidth] = useState(600);
  const [newsHeight, setNewsHeight] = useState(400);
  const [newsResizing, setNewsResizing] = useState(false);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiFocusMode, setAiFocusMode] = useState(false);
  const [micStream, setMicStream] = useState(null);
  const [micStatus, setMicStatus] = useState('idle'); // idle | listening | processing | playing | error
  const [micError, setMicError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [routerText, setRouterText] = useState('');
  const [aiResponseText, setAiResponseText] = useState(''); // Display AI response text immediately
  const [audioObj, setAudioObj] = useState(null);
  const [micRestartKey, setMicRestartKey] = useState(0);
  const [activePage, setActivePage] = useState('dashboard');
  const [showLeft, setShowLeft] = useState(true);
  const [musicSearchQuery, setMusicSearchQuery] = useState('');
  const { selectPersona } = usePersonas();
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

  const handleLeftResize = (clientX) => {
    const newWidth = Math.max(400, Math.min(800, clientX - 20));
    setLeftWidth(newWidth);
  };

  // News resize handlers (vertical separator between news and widgets)
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!newsResizing) return;
      const newHeight = Math.max(200, Math.min(window.innerHeight - 300, e.clientY - 60));
      setNewsHeight(newHeight);
    };
    const onMouseUp = () => {
      if (newsResizing) setNewsResizing(false);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [newsResizing]);

  const handleSwitchAI = () => {
    setPersonaModalOpen(true);
  };

  const handlePersonaSelect = async (personaName) => {
    await selectPersona(personaName);
    setPersonaModalOpen(false);
  };

  const toggleAiFocus = () => setAiFocusMode((prev) => !prev);

  const beginListening = () => {
    // Ensure overlay is open
    if (!aiFocusMode) {
      setAiFocusMode(true);
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
          const routedParsed = data.router_parsed;
          const routedRaw = data.router_answer;
          const routedError = data.router_error;
          const fallback = data.transcript || '';
          const routerDisplay =
            (routedParsed && (routedParsed.value || routedParsed.type || JSON.stringify(routedParsed))) ||
            (routedRaw && routedRaw.trim()) ||
            (routedError && `Router error: ${routedError}`) ||
            '(no router output)';
          console.log('Router display:', routerDisplay, 'Transcript:', fallback);
          // Route the parsed decision to backend for actions/tts
          if (data.router_parsed && data.router_parsed.type && data.router_parsed.value) {
            try {
              // First, get the text response immediately for display
              console.log('Requesting text response...');
              const textStartTime = Date.now();
              
              const textResp = await routerAPI.route({
                type: data.router_parsed.type,
                value: data.router_parsed.value,
                mode: 'qa',
              });
              
              const textTime = Date.now() - textStartTime;
              console.log(`Text response received in ${textTime}ms`);
              
              if (textResp?.data?.success) {
                const responseText = textResp.data.result || textResp.data.answer || '';
                setAiResponseText(responseText);
                console.log('Displaying text response:', responseText.substring(0, 100) + '...');
              }
              
              // Now stream the audio response
              console.log('Requesting streaming audio...');
              const audioStartTime = Date.now();
              
              const routeResp = await routerAPI.routeStream({
                type: data.router_parsed.type,
                value: data.router_parsed.value,
                mode: 'qa',
                ai_mode: true,
              });
              
              const audioResponseTime = Date.now() - audioStartTime;
              console.log(`Audio response received in ${audioResponseTime}ms (total: ${Date.now() - textStartTime}ms)`);
              
              const blob = routeResp?.data;
              if (blob && blob.type && blob.type.startsWith('audio/')) {
                console.log('Audio blob received, size:', blob.size);
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                setAudioObj(audio);
                
                // Set to playing as soon as we have audio
                console.log('Setting status to playing');
                setMicStatus('playing');
                
                // Handle audio events
                audio.oncanplaythrough = () => {
                  console.log('Audio ready to play through');
                };
                
                audio.onended = () => {
                  console.log('Audio ended, resetting to idle');
                  setMicStatus('idle');
                  setAiResponseText(''); // Clear text when audio finishes
                };
                
                audio.onerror = (err) => {
                  console.error('Audio playback error:', err, audio.error);
                  setMicStatus('idle');
                  setAiResponseText(''); // Clear text on error
                };
                
                // Start playback
                try {
                  await audio.play();
                  const playStartTime = Date.now() - textStartTime;
                  console.log(`Audio playback started in ${playStartTime}ms from initial request`);
                } catch (err) {
                  console.error('Audio play failed:', err);
                  setMicStatus('idle');
                }
              } else if (blob) {
                // Try to parse JSON error/success message
                try {
                  const textBody = await blob.text();
                  console.log('Router route JSON/text response:', textBody);
                } catch (e) {
                  console.log('Router route non-audio response:', blob);
                }
                setMicStatus('idle');
              } else {
                console.log('No blob in response');
                setMicStatus('idle');
              }
            } catch (err) {
              console.error('Router route failed:', err);
              setMicStatus('idle');
              setAiResponseText(''); // Clear text on error
            }
          }

          // Keep transcript/router info only in console (no UI)
          setTranscript('');
          setRouterText('');
          // Don't reset to idle here - let audio.onended handle it
          // if (micStatus !== 'playing') {
          //   setMicStatus('idle');
          // }
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
    if (aiFocusMode && micStatus === 'listening') {
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
  }, [aiFocusMode, micRestartKey, micStatus]);

  // Compute dynamic grid columns based on visibility
  const gridColumns = (() => {
    const minLeft = Math.max(leftWidth, 480);
    if (showLeft) return `minmax(480px, ${minLeft}px) 4px 1fr`;
    return `1fr`;
  })();

  return (
    <div className={`app-shell ${aiFocusMode ? 'ai-focus' : ''}`}>
      <TopBar 
        onSwitchAI={handleSwitchAI}
        onSettingsClick={() => setSettingsOpen(true)}
        activePage={activePage}
        onNavigate={(page) => setActivePage(page)}
        onMusicSearch={(query) => setMusicSearchQuery(query)}
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
      ) : (
        <div 
          className="main-container"
          style={{
            gridTemplateColumns: gridColumns
          }}
        >
          {showLeft && (
            <div className="left-section">
              <div className="news-section" style={{ height: `${newsHeight}px` }}>
                <CenterPanel 
                  audioUrl={audioUrl} 
                  onAudioUrlChange={setAudioUrl}
                />
              </div>
              <div
                className={`news-resizer ${newsResizing ? 'resizing' : ''}`}
                onMouseDown={() => setNewsResizing(true)}
                title="Drag to resize news"
              />
              <div className="widgets-section">
                <LeftPanel />
              </div>
            </div>
          )}
          {showLeft && <PanelResizer onResize={handleLeftResize} />}
          <div className="right-section">
            <Chat 
              sessionId={sessionId}
              onAudioGenerated={setAudioUrl}
              audioQueue={audioQueue}
              aiFocusMode={aiFocusMode}
              onMicClick={toggleAiFocus}
            />
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
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onNavigate={(page) => setActivePage(page)}
      />
      {aiFocusMode && (
        <div className="ai-focus-overlay">
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
          {aiResponseText && (
            <div className="ai-response-text">
              {aiResponseText}
            </div>
          )}
          <button
            className="ai-focus-revert"
            onClick={toggleAiFocus}
            title="Exit AI Focus"
          >
            &lt;&gt;
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
