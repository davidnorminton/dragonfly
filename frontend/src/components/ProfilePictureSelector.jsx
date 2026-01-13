import { useState } from 'react';

// Generate local avatar paths (30 avatars available)
const generateAvatarPath = (index) => {
  return `/api/users/avatars/ai-avatar-${String(index).padStart(2, '0')}.svg`;
};

export function ProfilePictureSelector({ onSelect, currentImage }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [showSelector, setShowSelector] = useState(false);

  // 30 avatars available
  const avatarOptions = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    url: generateAvatarPath(i),
    path: `data/user_profiles/avatars/ai-avatar-${String(i).padStart(2, '0')}.svg`
  }));

  const handleSelect = (avatar) => {
    setSelectedIndex(avatar.id);
    // Pass the local file path to store in database
    if (onSelect) {
      onSelect(avatar.path, avatar.url); // path for DB, url for preview
    }
    setShowSelector(false);
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <button
        type="button"
        onClick={() => setShowSelector(!showSelector)}
        style={{
          padding: '8px 16px',
          background: 'rgba(102, 126, 234, 0.2)',
          border: '1px solid rgba(102, 126, 234, 0.4)',
          borderRadius: '6px',
          color: '#667eea',
          cursor: 'pointer',
          fontSize: '0.9rem',
          fontWeight: '500',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(102, 126, 234, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(102, 126, 234, 0.2)';
        }}
      >
        {showSelector ? 'Hide' : 'Choose'} AI Avatar
      </button>

      {showSelector && (
        <div
          style={{
            marginTop: '16px',
            padding: '20px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '16px'
          }}
        >
          {avatarOptions.map((avatar) => (
            <div
              key={avatar.id}
              onClick={() => handleSelect(avatar)}
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: '50%',
                overflow: 'hidden',
                cursor: 'pointer',
                border: selectedIndex === avatar.id
                  ? '3px solid #667eea'
                  : '2px solid rgba(255, 255, 255, 0.2)',
                transition: 'all 0.2s ease',
                background: 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                if (selectedIndex !== avatar.id) {
                  e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.5)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedIndex !== avatar.id) {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
            >
              <img
                src={avatar.url}
                alt={`Avatar ${avatar.id + 1}`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
                onError={(e) => {
                  // Fallback if image fails to load
                  e.target.style.display = 'none';
                  e.target.parentElement.innerHTML = `<div style="color: #9da7b8; font-size: 0.8rem;">Avatar ${avatar.id + 1}</div>`;
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
