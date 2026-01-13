import { useEffect } from 'react';
import { usePersonas } from '../hooks/usePersonas';
import { getPersonaImageUrl } from '../utils/personaImageHelper';

export function PersonaModal({ open, onClose, onSelect }) {
  const { personas, currentPersona, reload } = usePersonas();

  // Refresh persona list each time the modal is opened so new configs appear without full page reload
  useEffect(() => {
    if (open) {
      reload();
    }
  }, [open]); // reload latest list when modal opens

  if (!open) return null;

  return (
    <div className="modal-overlay active" onClick={(e) => e.target.className === 'modal-overlay active' && onClose()}>
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-header">
          <div className="modal-title">Select Persona</div>
          <div className="modal-subtitle">Choose an AI personality for your assistant.</div>
        </div>
        <div className="persona-list">
          {personas.map((persona) => (
            <div
              key={persona.name}
              className={`persona-item ${persona.name === currentPersona ? 'selected' : ''}`}
              onClick={() => onSelect(persona.name)}
            >
              {getPersonaImageUrl(persona.image_path, persona.name) ? (
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '2px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px'
                }}>
                  <img
                    src={getPersonaImageUrl(persona.image_path, persona.name)}
                    alt={persona.title || persona.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = '<span style="color: #3b82f6; font-size: 2em;">👤</span>';
                    }}
                  />
                </div>
              ) : (
                <div className="persona-image-placeholder">👤</div>
              )}
              <div className="persona-name">{persona.title}</div>
              <div className="persona-title">{persona.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


