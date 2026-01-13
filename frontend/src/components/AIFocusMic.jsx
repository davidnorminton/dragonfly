import { useState, useEffect } from 'react';
import { WaveformMic } from './WaveformMic';
import { getPersonaImageUrl } from '../utils/personaImageHelper';

export function AIFocusMic({ personas, currentPersona, currentTitle, micStatus }) {
  const [showAvatar, setShowAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    // Reset state when persona changes
    setImageError(false);
    setShowAvatar(false);
    setAvatarUrl(null);

    if (personas && personas.length > 0 && currentPersona) {
      const currentPersonaData = personas.find(p => p.name === currentPersona);
      
      if (currentPersonaData && currentPersonaData.image_path) {
        const imagePath = currentPersonaData.image_path;
        if (imagePath && 
            imagePath !== 'null' && 
            imagePath !== 'undefined' &&
            String(imagePath).trim() !== '') {
          const url = getPersonaImageUrl(imagePath, currentPersona);
          if (url) {
            setAvatarUrl(url);
            setShowAvatar(true);
          }
        }
      }
    }
  }, [personas, currentPersona]);

  if (showAvatar && avatarUrl && !imageError) {
    return (
      <div className="ai-focus-persona-avatar">
        <img 
          src={avatarUrl} 
          alt={currentTitle || 'Persona'}
          className={`persona-avatar-img ${
            ['listening', 'processing', 'playing'].includes(micStatus) ? 'active' : ''
          }`}
          onError={() => {
            setImageError(true);
            setShowAvatar(false);
          }}
        />
        {['listening', 'processing', 'playing'].includes(micStatus) && (
          <div className="persona-avatar-pulse"></div>
        )}
      </div>
    );
  }

  return <WaveformMic status={micStatus} />;
}
