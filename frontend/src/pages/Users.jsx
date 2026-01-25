import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PasscodeModal } from '../components/PasscodeModal';
import { PersonaTestModal } from '../components/PersonaTestModal';
import { getProfileImageUrl } from '../utils/profileImageHelper';
import { getPersonaImageUrl } from '../utils/personaImageHelper';
import { usePersonas } from '../hooks/usePersonas';

// PersonaSelector component - inline persona selection
function PersonaSelector({ selectedUser, onTestPersona }) {
  console.log('[PersonaSelector] Rendering with selectedUser:', selectedUser?.id, selectedUser?.name);
  const { personas, currentPersona, selectPersona, reload } = usePersonas(selectedUser?.id);
  const personaScrollRef = useRef(null);

  // The usePersonas hook already handles reloading when selectedUserId changes,
  // but we can force a reload here if needed when the user changes
  useEffect(() => {
    console.log('[PersonaSelector] selectedUser changed, reloading personas for userId:', selectedUser?.id);
    if (selectedUser?.id) {
      reload();
    }
  }, [selectedUser?.id, reload]);

  // Setup wheel handler for persona scroll
  useEffect(() => {
    const el = personaScrollRef.current;
    if (!el) return;
    
    const handler = (e) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const handleSelectPersona = async (personaName) => {
    await selectPersona(personaName, selectedUser?.id);
  };

  const handleTestPersona = (e, persona) => {
    e.stopPropagation(); // Prevent selecting the persona when clicking test button
    console.log('[PersonaSelector] Opening test modal for persona:', persona);
    if (onTestPersona) {
      onTestPersona(persona);
    }
  };

  return (
    <div>
      <h3 style={{ 
        color: '#fff', 
        fontSize: '1.5rem', 
        fontWeight: '600', 
        marginBottom: '12px' 
      }}>
        Switch Persona
      </h3>
      <p style={{ 
        color: '#9da7b8', 
        fontSize: '0.9rem', 
        marginBottom: '24px' 
      }}>
        Choose an AI personality for your assistant
      </p>
      <div 
        ref={personaScrollRef}
        style={{ 
          display: 'flex',
          gap: '16px',
          overflowX: 'auto',
          overflowY: 'visible', // Allow overflow to prevent cut-off
          paddingBottom: '10px',
          paddingTop: '4px', // Extra top padding to prevent cut-off
          paddingLeft: '6px',
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch'
        }}
        className="persona-scroll-container"
      >
        {personas.map((persona) => (
          <div
            key={persona.name}
            onClick={() => handleSelectPersona(persona.name)}
            style={{
              flexShrink: 0,
              width: '200px',
              padding: '20px',
              paddingTop: '24px', // Extra top padding to prevent cut-off
              background: persona.name === currentPersona
                ? 'rgba(102, 126, 234, 0.2)'
                : 'rgba(255, 255, 255, 0.03)',
              border: persona.name === currentPersona
                ? '2px solid rgba(102, 126, 234, 0.6)'
                : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              transform: persona.name === currentPersona ? 'scale(1.02)' : 'scale(1)',
              boxShadow: persona.name === currentPersona ? '0 4px 12px rgba(102, 126, 234, 0.3)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              textAlign: 'center',
              overflow: 'visible' // Ensure content isn't clipped
            }}
            onMouseEnter={(e) => {
              if (persona.name !== currentPersona) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }
            }}
            onMouseLeave={(e) => {
              if (persona.name !== currentPersona) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }
            }}
          >
            {getPersonaImageUrl(persona.image_path, persona.name) ? (
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '2px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
                flexShrink: 0
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
                    e.target.parentElement.innerHTML = '<span style="color: #fff; font-size: 2rem;">👤</span>';
                  }}
                />
              </div>
            ) : (
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                marginBottom: '12px'
              }}>
                👤
              </div>
            )}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%'
            }}>
              <div style={{
                color: '#fff',
                fontSize: '1.1rem',
                fontWeight: '500',
                textAlign: 'center',
                width: '100%',
                marginBottom: '8px'
              }}>
                {persona.title || persona.name}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTestPersona(e, persona);
                }}
                title="Test this persona"
                style={{
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#9da7b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  width: '20px',
                  height: '20px',
                  opacity: 0.6,
                  margin: '0 auto'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.color = '#667eea';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.6';
                  e.currentTarget.style.color = '#9da7b8';
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UsersPage({ onNavigate, selectedUser, onSelectUser }) {
  const isAdmin = selectedUser?.is_admin === true;
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testPersona, setTestPersona] = useState(null);
  const usersGridRef = useRef(null);

  // Debug: Log state changes
  useEffect(() => {
    console.log('[UsersPage] testPersona changed:', testPersona);
    console.log('[UsersPage] testModalOpen changed:', testModalOpen);
  }, [testPersona, testModalOpen]);

  // Setup wheel handler for users grid scroll
  useEffect(() => {
    const el = usersGridRef.current;
    if (!el) return;
    
    const handler = (e) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

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
        <div className="settings-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Switch User</h2>
          {isAdmin && (
            <button
              onClick={() => {
                if (onNavigate) {
                  onNavigate('personal');
                }
              }}
              style={{
                padding: '8px 16px',
                background: 'rgba(102, 126, 234, 0.2)',
                border: '1px solid rgba(102, 126, 234, 0.4)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(102, 126, 234, 0.3)';
                e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(102, 126, 234, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.4)';
              }}
              title="Manage Personal Chat Summaries"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                <path d="M13 8H3"></path>
                <path d="M17 12H3"></path>
              </svg>
              Personal Chat
            </button>
          )}
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
              <div 
                className="users-grid"
                ref={usersGridRef}
                style={{ 
                  display: 'flex',
                  gap: '32px',
                  marginBottom: '40px',
                  overflowX: 'auto',
                  overflowY: 'visible', // Allow overflow to prevent cut-off
                  paddingBottom: '10px',
                  paddingTop: '4px', // Extra top padding to prevent cut-off
                  scrollBehavior: 'smooth',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                  {users.map((user) => {
                    const isSelected = selectedUser && selectedUser.id === user.id;
                    return (
                    <div 
                      key={user.id} 
                      className="user-card"
                      onClick={() => handleUserSelect(user)}
                      style={{
                        flexShrink: 0,
                        width: '160px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        padding: '20px',
                        paddingTop: '24px', // Extra top padding to prevent cut-off
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
                        boxShadow: isSelected ? '0 4px 12px rgba(102, 126, 234, 0.3)' : 'none',
                        textAlign: 'center',
                        overflow: 'visible' // Ensure content isn't clipped
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
                          border: user.is_admin 
                            ? '3px solid #4caf50' 
                            : '2px solid rgba(255, 255, 255, 0.1)'
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
                          wordBreak: 'break-word',
                          width: '100%',
                          marginBottom: '8px'
                        }}
                      >
                        {user.name}
                      </div>
                      {/* Edit button with minimalist icon - Admin can edit all, users can edit themselves */}
                      {(isAdmin || (selectedUser && selectedUser.id === user.id)) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditUser(user);
                          }}
                          style={{
                            padding: '4px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#9da7b8',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                            width: '20px',
                            height: '20px',
                            opacity: 0.6,
                            margin: '0 auto'
                          }}
                          title="Edit user"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.color = '#667eea';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '0.6';
                            e.currentTarget.style.color = '#9da7b8';
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                        </button>
                      )}
                  </div>
                    );
                  })}
                  
                  {/* Add User Card */}
                  <div 
                    className="user-card add-user-card"
                    onClick={handleAddUser}
                    style={{
                      flexShrink: 0,
                      width: '160px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '20px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      textAlign: 'center'
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

              {/* Persona Selector Section */}
              <div style={{ 
                marginTop: '60px', 
                paddingTop: '40px'
              }}>
                <PersonaSelector 
                  selectedUser={selectedUser}
                  onTestPersona={(persona) => {
                    console.log('[UsersPage] Opening test modal for persona:', persona);
                    console.log('[UsersPage] Setting testPersona and testModalOpen to true');
                    setTestPersona(persona);
                    setTestModalOpen(true);
                    console.log('[UsersPage] State updated');
                  }}
                />
              </div>
        </div>
      </div>
      
      <PasscodeModal
        isOpen={passcodeModalOpen}
        onClose={handleClosePasscodeModal}
        onVerify={handleVerifyPasscode}
        userName={pendingUser?.name || ''}
      />
      
      {typeof document !== 'undefined' && testPersona && createPortal(
        <PersonaTestModal
          persona={testPersona}
          isOpen={testModalOpen}
          onClose={() => {
            console.log('[UsersPage] Closing test modal');
            setTestModalOpen(false);
            setTestPersona(null);
          }}
        />,
        document.body
      )}
    </div>
  );
}
