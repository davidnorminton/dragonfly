import { useState, useEffect } from 'react';
import { ProfilePictureSelector } from '../components/ProfilePictureSelector';
import { getProfileImageUrl } from '../utils/profileImageHelper';

export function EditUserPage({ onNavigate, user, selectedUser }) {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    birthday: user?.birthday ? user.birthday.split('T')[0] : '',
    pass_code: user?.pass_code || ''
  });
  const [profilePicturePath, setProfilePicturePath] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(() => {
    return getProfileImageUrl(user?.profile_picture, user?.id);
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const isAdmin = selectedUser?.is_admin === true;
  const canDelete = isAdmin && selectedUser && selectedUser.id !== user?.id;

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        birthday: user.birthday ? user.birthday.split('T')[0] : '',
        pass_code: user.pass_code || ''
      });
      // Update preview URL
      setPreviewUrl(getProfileImageUrl(user.profile_picture, user.id));
      console.log(`[EditUser] User loaded, profile_picture="${user.profile_picture}" -> previewUrl="${getProfileImageUrl(user.profile_picture, user.id)}"`);
    }
  }, [user]);

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
        formDataToSend.append('birthday', formData.birthday);
      }
      if (formData.pass_code !== undefined) {
        formDataToSend.append('pass_code', formData.pass_code || '');
      }
      if (profilePicturePath) {
        formDataToSend.append('profile_picture_url', profilePicturePath);
      }

      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        body: formDataToSend
      });

      const data = await response.json();
      console.log('User update response:', data);
      
      if (data.success && data.user) {
        const updatedUser = data.user;
        console.log(`[EditUser] User updated successfully:`, updatedUser);
        
        // Update the local preview
        const newPreviewUrl = getProfileImageUrl(updatedUser.profile_picture, updatedUser.id);
        setPreviewUrl(newPreviewUrl);
        console.log(`[EditUser] Updated preview URL: ${newPreviewUrl}`);
        
        // Update selectedUser if this is the currently selected user
        window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
        
        // Navigate back to users page
        if (onNavigate) {
          onNavigate('users');
        }
      } else {
        setError(data.error || 'Failed to update user');
      }
    } catch (err) {
      console.error('Error updating user:', err);
      setError(err.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!user) return;
    
    if (!confirm(`Are you sure you want to delete user "${user.name}"? This action cannot be undone.`)) {
      return;
    }
    
    setDeleting(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      if (data.success) {
        // Navigate back to users page
        if (onNavigate) {
          onNavigate('users');
        }
      } else {
        setError(data.error || 'Failed to delete user');
        setDeleting(false);
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(err.message || 'Failed to delete user');
      setDeleting(false);
    }
  };

  if (!user) {
    return (
      <div className="settings-page">
        <div className="settings-container">
          <div className="settings-header">
            <h2>Edit User</h2>
          </div>
          <div className="settings-content">
            <div className="settings-message error">User not found</div>
            <button
              onClick={() => onNavigate?.('users')}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                background: 'rgba(102, 126, 234, 0.2)',
                border: '1px solid rgba(102, 126, 234, 0.4)',
                borderRadius: '6px',
                color: '#667eea',
                cursor: 'pointer'
              }}
            >
              Back to Users
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <h2>Edit User</h2>
        </div>

        <div className="settings-content">
          {error && (
            <div className="settings-message error" style={{ marginBottom: '20px' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ maxWidth: '500px', margin: '0 auto' }}>
            {/* Profile Picture Preview */}
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              marginBottom: '30px' 
            }}>
              <div 
                style={{
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
                  border: '2px solid rgba(255, 255, 255, 0.2)'
                }}
              >
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
                    onError={(e) => {
                      console.error(`[EditUser] Failed to load preview image: ${previewUrl}`, e);
                      e.target.style.display = 'none';
                      e.target.parentElement.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                      e.target.parentElement.textContent = getInitials(formData.name);
                    }}
                    onLoad={() => {
                      console.log(`[EditUser] Successfully loaded preview image: ${previewUrl}`);
                    }}
                  />
                ) : (
                  <span>{getInitials(formData.name)}</span>
                )}
              </div>
              
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
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

            {/* Name Field */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#9da7b8',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}>
                Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Birthday Field */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#9da7b8',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}>
                Birthday
              </label>
              <input
                type="date"
                value={formData.birthday}
                onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Pass Code Field */}
            <div style={{ marginBottom: '30px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                color: '#9da7b8',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}>
                Pass Code
              </label>
              <input
                type="password"
                value={formData.pass_code}
                onChange={(e) => setFormData({ ...formData, pass_code: e.target.value })}
                placeholder="Optional pass code"
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Submit Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
              {/* Delete button - Only show for admins deleting other users */}
              {canDelete && (
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  disabled={deleting}
                  style={{
                    padding: '12px 24px',
                    background: deleting ? 'rgba(244, 67, 54, 0.3)' : 'rgba(244, 67, 54, 0.2)',
                    border: '1px solid rgba(244, 67, 54, 0.4)',
                    borderRadius: '8px',
                    color: '#f44336',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!deleting) {
                      e.currentTarget.style.background = 'rgba(244, 67, 54, 0.3)';
                      e.currentTarget.style.borderColor = 'rgba(244, 67, 54, 0.6)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!deleting) {
                      e.currentTarget.style.background = 'rgba(244, 67, 54, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(244, 67, 54, 0.4)';
                    }
                  }}
                >
                  {deleting ? 'Deleting...' : 'Delete User'}
                </button>
              )}
              <div style={{ display: 'flex', gap: '12px', marginLeft: canDelete ? 'auto' : '0' }}>
                <button
                  type="button"
                  onClick={() => onNavigate?.('users')}
                  style={{
                    padding: '12px 24px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#9da7b8',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#9da7b8';
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '12px 24px',
                    background: saving ? 'rgba(102, 126, 234, 0.3)' : 'rgba(102, 126, 234, 0.2)',
                    border: '1px solid rgba(102, 126, 234, 0.4)',
                    borderRadius: '8px',
                    color: '#667eea',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) {
                      e.currentTarget.style.background = 'rgba(102, 126, 234, 0.3)';
                      e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.6)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) {
                      e.currentTarget.style.background = 'rgba(102, 126, 234, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.4)';
                    }
                  }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
