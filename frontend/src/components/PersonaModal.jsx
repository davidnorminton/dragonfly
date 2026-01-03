import { usePersonas } from '../hooks/usePersonas';

export function PersonaModal({ open, onClose, onSelect }) {
  const { personas, currentPersona } = usePersonas();

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
              <div className="persona-image-placeholder">👤</div>
              <div className="persona-name">{persona.title}</div>
              <div className="persona-title">{persona.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

