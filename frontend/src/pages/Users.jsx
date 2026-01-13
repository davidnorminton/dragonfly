import { useState, useEffect } from 'react';
import { PasscodeModal } from '../components/PasscodeModal';
import { getProfileImageUrl } from '../utils/profileImageHelper';

export function UsersPage({ onNavigate, selectedUser, onSelectUser }) {
  const isAdmin = selectedUser?.is_admin === true;
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Reload when component mounts or when reloadTrigger changes
  useEffect(() => {
    console.log('[Users] Component mounted or reload triggered, loading users...');
    loadUsers();
  }, [reloadTrigger]);

  // Also reload when the page becomes active (hash changes to #users)
  useEffect(() => {
    const checkAndReload = () => {
      if (window.location.hash === '#users' || window.location.hash === '') {
        console.log('[Users] Page is active, reloading users...');
        setReloadTrigger(prev => prev + 1);
      }
    };
    
    // Check immediately
    checkAndReload();
    
    // Also listen for hash changes
    const handleHashChange = () => {
      if (window.location.hash === '#users') {
        console.log('[Users] Hash changed to #users, reloading...');
        setReloadTrigger(prev => prev + 1);
      }
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Reload users when page becomes visible or when navigating to this page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadUsers();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also reload when window gains focus
    const handleFocus = () => {
      loadUsers();
    };
    window.addEventListener('focus', handleFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Update selected user highlight when selectedUser prop changes
  useEffect(() => {
    // This ensures the UI updates when selectedUser changes from outside
  }, [selectedUser]);

  // Listen for user updates and reload the user list
  useEffect(() => {
    const handleUserUpdate = (event) => {
      console.log('[Users] User updated event received, reloading users list', event.detail);
      // Trigger reload by incrementing reloadTrigger
      setReloadTrigger(prev => prev + 1);
    };
    
    window.addEventListener('userUpdated', handleUserUpdate);
    return () => window.removeEventListener('userUpdated', handleUserUpdate);
  }, []);
  
  // Also listen for navigation to this page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && window.location.hash === '#users') {
        console.log('[Users] Page became visible, reloading users...');
        setReloadTrigger(prev => prev + 1);
      }
    };
    
    const handleFocus = () => {
      if (window.location.hash === '#users') {
        console.log('[Users] Window focused, reloading users...');
        setReloadTrigger(prev => prev + 1);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      if (data.success) {
        console.log('[Users] Loaded users:', data.users.map(u => ({ id: u.id, name: u.name, profile_picture: u.profile_picture })));
        setUsers(data.users);
        
        // Update selectedUser if it's in the list and has new data
        if (selectedUser && onSelectUser) {
          const updatedUser = data.users.find(u => u.id === selectedUser.id);
          if (updatedUser) {
            // Check if profile_picture has changed
            if (updatedUser.profile_picture !== selectedUser.profile_picture) {
              console.log('[Users] Updating selectedUser with fresh data:', updatedUser);
              onSelectUser(updatedUser);
            }
          }
        }
      } else {
        setError('Failed to load users');
      }
    } catch (err) {
      console.error('Error loading users:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = () => {
    if (onNavigate) {
      onNavigate('add-user');
    }
  };

  const handleEditUser = (user) => {
    if (onNavigate) {
      onNavigate('edit-user', user);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      if (data.success) {
        await loadUsers();
      } else {
        setError('Failed to delete user');
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(err.message);
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleUserSelect = (user) => {
    // If current user is not admin and trying to select an admin user, require passcode
    if (!isAdmin && user.is_admin) {
      // Check if admin user has a passcode set
      if (user.pass_code && user.pass_code.trim()) {
        setPendingUser(user);
        setPasscodeModalOpen(true);
        return;
      }
      // If admin has no passcode, allow selection (backward compatibility)
    }
    // Use the fresh user data from the users array
    const freshUser = users.find(u => u.id === user.id) || user;
    console.log('[Users] Selecting user:', freshUser);
    onSelectUser?.(freshUser);
  };

  const handleVerifyPasscode = async (enteredPasscode) => {
    if (!pendingUser) return false;
    
    // Compare entered passcode with admin user's passcode
    const isValid = enteredPasscode.trim() === (pendingUser.pass_code || '').trim();
    
    if (isValid) {
      // Passcode is correct, proceed with user selection
      // Use fresh user data from the users array
      const freshUser = users.find(u => u.id === pendingUser.id) || pendingUser;
      console.log('[Users] Passcode verified, selecting user:', freshUser);
      onSelectUser?.(freshUser);
      setPendingUser(null);
      return true;
    }
    
    return false;
  };

  const handleClosePasscodeModal = () => {
    setPasscodeModalOpen(false);
    setPendingUser(null);
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <h2>Users</h2>
        </div>

        <div className="settings-content">
          {error && (
            <div className="settings-message error" style={{ marginBottom: '20px' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9da7b8' }}>
              Loading users...
            </div>
          ) : (
            <>
              <div className="users-grid" style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: '32px',
                  marginBottom: '40px',
                  maxWidth: '1200px',
                  margin: '0 auto 40px auto',
                  justifyContent: 'center'
                }}>
                  {users.map((user) => {
                    const isSelected = selectedUser && selectedUser.id === user.id;
                    return (
                    <div 
                      key={user.id} 
                      className="user-card"
                      onClick={() => handleUserSelect(user)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '20px',
                        background: isSelected 
                          ? 'rgba(102, 126, 234, 0.2)' 
                          : 'rgba(255, 255, 255, 0.03)',
                        border: isSelected
                          ? '2px solid rgba(102, 126, 234, 0.6)'
                          : '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                        boxShadow: isSelected ? '0 4px 12px rgba(102, 126, 234, 0.3)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        }
                      }}
                    >
                      <div 
                        className="user-avatar"
                        style={{
                          width: '100px',
                          height: '100px',
                          borderRadius: '50%',
                          background: user.profile_picture 
                            ? 'transparent' 
                            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '2.2rem',
                          fontWeight: '600',
                          marginBottom: '16px',
                          flexShrink: 0,
                          overflow: 'hidden',
                          border: '2px solid rgba(255, 255, 255, 0.1)'
                        }}
                      >
                        {(() => {
                          const imageUrl = getProfileImageUrl(user.profile_picture, user.id);
                          console.log(`[Users] User ${user.id} (${user.name}): profile_picture="${user.profile_picture}" -> imageUrl="${imageUrl}"`);
                          
                          return imageUrl ? (
                            <img 
                              key={`user-${user.id}-${user.profile_picture}`}
                              src={imageUrl}
                              alt={user.name}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                borderRadius: '50%'
                              }}
                              onError={(e) => {
                                console.error(`[Users] Failed to load image for user ${user.id}: ${imageUrl}`);
                                e.target.style.display = 'none';
                                e.target.parentElement.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                                const initials = getInitials(user.name);
                                e.target.parentElement.innerHTML = `<span style="color: #fff; font-size: 2.2rem; font-weight: 600;">${initials}</span>`;
                              }}
                              onLoad={() => {
                                console.log(`[Users] Successfully loaded image for user ${user.id}: ${imageUrl}`);
                              }}
                            />
                          ) : (
                            <span>{getInitials(user.name)}</span>
                          );
                        })()}
                      </div>
                      <div 
                        className="user-name"
                        style={{
                          color: '#fff',
                          fontSize: '1.1rem',
                          fontWeight: '500',
                          textAlign: 'center',
                          wordBreak: 'break-word'
                        }}
                      >
                        {user.name}
                      </div>
                      {user.is_admin && (
                        <div style={{
                          marginTop: '8px',
                          padding: '2px 8px',
                          background: 'rgba(76, 175, 80, 0.2)',
                          color: '#4caf50',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}>
                        Admin
                      </div>
                    )}
                    {/* Edit/Delete buttons */}
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      marginTop: '12px',
                      justifyContent: 'center'
                    }}>
                      {/* Edit button - Admin can edit all, users can edit themselves */}
                      {(isAdmin || (selectedUser && selectedUser.id === user.id)) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditUser(user);
                          }}
                          style={{
                            padding: '6px 12px',
                            background: 'rgba(102, 126, 234, 0.2)',
                            border: '1px solid rgba(102, 126, 234, 0.4)',
                            borderRadius: '6px',
                            color: '#667eea',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '500',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(102, 126, 234, 0.3)';
                            e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.6)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(102, 126, 234, 0.2)';
                            e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.4)';
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {/* Delete button - Only admins can delete, and only other users (not themselves) */}
                      {isAdmin && selectedUser && selectedUser.id !== user.id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteUser(user.id);
                          }}
                          style={{
                            padding: '6px 12px',
                            background: 'rgba(244, 67, 54, 0.2)',
                            border: '1px solid rgba(244, 67, 54, 0.4)',
                            borderRadius: '6px',
                            color: '#f44336',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '500',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(244, 67, 54, 0.3)';
                            e.currentTarget.style.borderColor = 'rgba(244, 67, 54, 0.6)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(244, 67, 54, 0.2)';
                            e.currentTarget.style.borderColor = 'rgba(244, 67, 54, 0.4)';
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                    );
                  })}
                  
                  {/* Add User Card */}
                  <div 
                    className="user-card add-user-card"
                    onClick={handleAddUser}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '20px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }}
                  >
                    <div 
                      className="user-avatar"
                      style={{
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: '4rem',
                        fontWeight: '300',
                        marginBottom: '16px',
                        flexShrink: 0,
                        border: '2px solid rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      +
                    </div>
                    <div 
                      className="user-name"
                      style={{
                        color: '#fff',
                        fontSize: '1.1rem',
                        fontWeight: '500',
                        textAlign: 'center',
                        wordBreak: 'break-word'
                      }}
                    >
                      Add User
                    </div>
                  </div>
                </div>
            </>
              )}
        </div>
      </div>
      
      <PasscodeModal
        isOpen={passcodeModalOpen}
        onClose={handleClosePasscodeModal}
        onVerify={handleVerifyPasscode}
        userName={pendingUser?.name || ''}
      />
    </div>
  );
}
