import { useState, useRef } from 'react';
import { getPersonaImageUrl } from '../utils/personaImageHelper';

export function PersonaImageUpload({ personaName, currentImagePath, onImageUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(() => {
    return getPersonaImageUrl(currentImagePath, personaName);
  });
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Please upload a JPG, JPEG, or PNG image.');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size too large. Maximum size is 5MB.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`/api/personas/${encodeURIComponent(personaName)}/image`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to upload image');
      }

      if (data.success) {
        // Update preview with new image
        const newPreviewUrl = getPersonaImageUrl(data.image_path, personaName);
        setPreviewUrl(newPreviewUrl);
        
        // Notify parent component
        if (onImageUploaded) {
          await onImageUploaded();
        }
      }
    } catch (err) {
      console.error('Error uploading persona image:', err);
      setError(err.message || 'Failed to upload image');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const imageUrl = previewUrl || getPersonaImageUrl(currentImagePath, personaName);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {imageUrl ? (
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '2px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <img
              src={imageUrl}
              alt={personaName}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentElement.innerHTML = '<span style="color: #9da7b8; font-size: 2rem;">👤</span>';
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              flexShrink: 0
            }}
          >
            👤
          </div>
        )}
        <div style={{ flex: 1 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png"
            onChange={handleFileSelect}
            disabled={uploading}
            style={{ display: 'none' }}
            id={`persona-image-upload-${personaName}`}
          />
          <label
            htmlFor={`persona-image-upload-${personaName}`}
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              background: uploading ? 'rgba(255, 255, 255, 0.1)' : 'rgba(102, 126, 234, 0.2)',
              border: '1px solid rgba(102, 126, 234, 0.4)',
              borderRadius: '6px',
              color: '#667eea',
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: '0.9em',
              transition: 'all 0.2s ease'
            }}
          >
            {uploading ? 'Uploading...' : imageUrl ? 'Change Image' : 'Upload Image'}
          </label>
        </div>
      </div>
      {error && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(255, 107, 107, 0.1)',
          border: '1px solid rgba(255, 107, 107, 0.3)',
          borderRadius: '6px',
          color: '#ff6b6b',
          fontSize: '0.85em'
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
