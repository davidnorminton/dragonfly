import { useState, useEffect, useRef } from 'react';

// Generate local avatar paths (30 avatars available)
const generateAvatarPath = (index) => {
  return `/api/users/avatars/ai-avatar-${String(index).padStart(2, '0')}.svg`;
};

export function ProfilePictureSelector({ onSelect, currentImage }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const scrollContainerRef = useRef(null);

  // 30 avatars available
  const avatarOptions = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    url: generateAvatarPath(i),
    path: `data/user_profiles/avatars/ai-avatar-${String(i).padStart(2, '0')}.svg`
  }));

  // Determine which avatar is currently selected based on currentImage
  useEffect(() => {
    if (currentImage) {
      // Extract avatar index from currentImage URL or path
      const match = currentImage.match(/ai-avatar-(\d+)\.svg/);
      if (match) {
        const index = parseInt(match[1], 10);
        setSelectedIndex(index);
      }
    }
  }, [currentImage]);

  // Scroll to selected avatar when component mounts or selectedIndex changes
  useEffect(() => {
    if (selectedIndex !== null && scrollContainerRef.current) {
      const avatarElement = scrollContainerRef.current.children[selectedIndex];
      if (avatarElement) {
        avatarElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedIndex]);

  const handleSelect = (avatar) => {
    setSelectedIndex(avatar.id);
    // Pass the local file path to store in database
    if (onSelect) {
      onSelect(avatar.path, avatar.url); // path for DB, url for preview
    }
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <div
        style={{
          padding: '20px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          overflow: 'hidden'
        }}
      >
        <div
          ref={scrollContainerRef}
          className="avatar-scroll-container"
          style={{
            display: 'flex',
            gap: '15px',
            maxWidth: '900px',
            overflowX: 'auto',
            overflowY: 'hidden',
            paddingBottom: '8px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(102, 126, 234, 0.5) rgba(255, 255, 255, 0.05)'
          }}
          onWheel={(e) => {
            // Allow horizontal scrolling with mouse wheel
            if (e.deltaY !== 0) {
              e.preventDefault();
              e.currentTarget.scrollLeft += e.deltaY;
            }
          }}
        >
          {avatarOptions.map((avatar) => {
            const isSelected = selectedIndex === avatar.id;
            return (
              <div
                key={avatar.id}
                onClick={() => handleSelect(avatar)}
                style={{
                  flexShrink: 0,
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: isSelected
                    ? '4px solid #667eea'
                    : '2px solid rgba(255, 255, 255, 0.2)',
                  transition: 'all 0.2s ease',
                  background: isSelected
                    ? 'rgba(102, 126, 234, 0.2)'
                    : 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                  boxShadow: isSelected
                    ? '0 0 12px rgba(102, 126, 234, 0.6)'
                    : 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.5)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
