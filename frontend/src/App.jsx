import { useState, useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { CenterPanel } from './components/CenterPanel';
import { Chat } from './components/Chat';
import { PanelResizer } from './components/PanelResizer';
import { PersonaModal } from './components/PersonaModal';
import { usePersonas } from './hooks/usePersonas';
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
  const { selectPersona } = usePersonas();

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

  return (
    <>
      <TopBar onSwitchAI={handleSwitchAI} />
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
        />
      </div>
      <PersonaModal 
        open={personaModalOpen}
        onClose={() => setPersonaModalOpen(false)}
        onSelect={handlePersonaSelect}
      />
    </>
  );
}

export default App;
