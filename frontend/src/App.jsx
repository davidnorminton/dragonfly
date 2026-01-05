import { useState, useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { CenterPanel } from './components/CenterPanel';
import { Chat } from './components/Chat';
import { PanelResizer } from './components/PanelResizer';
import { PersonaModal } from './components/PersonaModal';
import { Settings } from './components/Settings';
import { BottomToolbar } from './components/BottomToolbar';
import { usePersonas } from './hooks/usePersonas';
import { useAudioQueue } from './hooks/useAudioQueue';
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
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(400);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiFocusMode, setAiFocusMode] = useState(false);
  const [micStream, setMicStream] = useState(null);
  const [micStatus, setMicStatus] = useState('idle'); // idle | listening | processing | done | error
  const [micError, setMicError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [routerText, setRouterText] = useState('');
  const { selectPersona } = usePersonas();
  const audioQueue = useAudioQueue();

  useEffect(() => {
    // Initialize session ID in localStorage if not present
    if (!localStorage.getItem('chatSessionId')) {
      localStorage.setItem('chatSessionId', sessionId);
    }
  }, [sessionId]);

  const handleLeftResize = (clientX) => {
    const newWidth = Math.max(200, Math.min(600, clientX - 20));
    setLeftWidth(newWidth);
  };

  const handleRightResize = (clientX) => {
    const windowWidth = window.innerWidth;
    const newWidth = Math.max(300, Math.min(800, windowWidth - clientX - 20));
    setRightWidth(newWidth);
  };

  const handleSwitchAI = () => {
    setPersonaModalOpen(true);
  };

  const handlePersonaSelect = async (personaName) => {
    await selectPersona(personaName);
    setPersonaModalOpen(false);
  };

  const toggleAiFocus = () => setAiFocusMode((prev) => !prev);

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
      setMicStatus('listening');
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
          const threshold = 0.02; // silence threshold
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
          setTranscript(fallback);
          setRouterText(routerDisplay);
          setMicStatus('done');
        } else {
          setMicStatus('error');
          setMicError(data.error || 'Transcription failed');
        }
      } catch (err) {
        setMicStatus('error');
        setMicError(err?.message || 'Transcription failed');
      }
    };
    if (aiFocusMode) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiFocusMode]);

  return (
    <div className={`app-shell ${aiFocusMode ? 'ai-focus' : ''}`}>
      <TopBar 
        onSwitchAI={handleSwitchAI}
        onSettingsClick={() => setSettingsOpen(true)}
      />
      <div 
        className="main-container"
        style={{
          gridTemplateColumns: `${leftWidth}px 4px 1fr 4px ${rightWidth}px`
        }}
      >
        <LeftPanel />
        <PanelResizer onResize={handleLeftResize} />
        <CenterPanel 
          audioUrl={audioUrl} 
          onAudioUrlChange={setAudioUrl}
        />
        <PanelResizer onResize={handleRightResize} />
        <Chat 
          sessionId={sessionId}
          onAudioGenerated={setAudioUrl}
          audioQueue={audioQueue}
        />
      </div>
      <PersonaModal 
        open={personaModalOpen}
        onClose={() => setPersonaModalOpen(false)}
        onSelect={handlePersonaSelect}
      />
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <BottomToolbar 
        sessionId={sessionId} 
        audioQueue={audioQueue} 
        onMicClick={toggleAiFocus}
      />
      {aiFocusMode && (
        <div className="ai-focus-overlay">
          <div className="ai-focus-mic">🎤</div>
          <div className="ai-focus-status">
            {micStatus === 'listening' && 'Listening...'}
            {micStatus === 'error' && `Mic error: ${micError}`}
            {micStatus === 'processing' && 'Transcribing...'}
            {micStatus === 'done' && (transcript || routerText) && 'Transcription complete'}
          </div>
          {(routerText || transcript) && (
            <div className="ai-focus-transcript">
              {routerText && (
                <div className="ai-focus-router">
                  <strong>AI Router:</strong> {routerText}
                </div>
              )}
              {transcript && (
                <div className="ai-focus-raw">
                  <strong>Transcript:</strong> {transcript}
                </div>
              )}
            </div>
          )}
          <button
            className="ai-focus-revert"
            onClick={toggleAiFocus}
            title="Exit AI Focus"
          >
            Revert
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
