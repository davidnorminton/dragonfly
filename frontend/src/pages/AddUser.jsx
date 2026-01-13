import { useState } from 'react';
import { ProfilePictureSelector } from '../components/ProfilePictureSelector';

export function AddUserPage({ onNavigate }) {
  const [formData, setFormData] = useState({
    name: '',
    birthday: '',
    pass_code: ''
  });
  const [profilePicturePath, setProfilePicturePath] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      
      if (formData.birthday) {
        formDataToSend.append('birthday', new Date(formData.birthday).toISOString());
      }
      
      if (formData.pass_code) {
        formDataToSend.append('pass_code', formData.pass_code);
      }
      
      if (profilePicturePath) {
        formDataToSend.append('profile_picture_url', profilePicturePath);
      }
      
      const response = await fetch('/api/users', {
        method: 'POST',
        body: formDataToSend
      });
      
      const data = await response.json();
      console.log('User creation response:', data);
      if (data.success) {
        // Navigate back to users page
        if (onNavigate) {
          onNavigate('users');
        }
      } else {
        setError(data.error || 'Failed to save user');
      }
    } catch (err) {
      console.error('Error saving user:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <h2>Add User</h2>
        </div>

        <div className="settings-content">
          {error && (
            <div className="settings-message error" style={{ marginBottom: '20px' }}>
              {error}
            </div>
          )}

          <div className="settings-panel">
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ 
                  width: '120px', 
                  height: '120px', 
                  borderRadius: '50%',
                  background: previewUrl 
                    ? 'transparent' 
                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '2.5rem',
                  fontWeight: '600',
                  marginBottom: '16px',
                  overflow: 'hidden',
                  border: '3px solid rgba(255, 255, 255, 0.2)',
                  position: 'relative'
                }}>
                  {previewUrl ? (
                    <img 
                      src={previewUrl} 
                      alt="Profile preview" 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover',
                        borderRadius: '50%'
                      }}
                    />
                  ) : (
                    <span>{getInitials(formData.name || '')}</span>
                  )}
                </div>
                
                <div style={{ width: '100%' }}>
                  <ProfilePictureSelector
                    onSelect={(path, preview) => {
                      setProfilePicturePath(path);
                      setPreviewUrl(preview);
                      setError(null);
                    }}
                    currentImage={previewUrl}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#9da7b8' }}>
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#9da7b8' }}>
                  Birthday
                </label>
                <input
                  type="date"
                  value={formData.birthday}
                  onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '30px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#9da7b8' }}>
                  Pass Code
                </label>
                <input
                  type="text"
                  value={formData.pass_code}
                  onChange={(e) => setFormData({ ...formData, pass_code: e.target.value })}
                  placeholder="Optional pass code"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  className="save-button"
                  disabled={saving}
                  style={{ flex: 1 }}
                >
                  {saving ? 'Adding...' : 'Add User'}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate?.('users')}
                  style={{
                    flex: 1,
                    padding: '12px 20px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.95rem'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
