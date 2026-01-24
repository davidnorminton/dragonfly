import { useState, useEffect } from 'react';
import { usePersonas } from '../hooks/usePersonas';
import { getProfileImageUrl } from '../utils/profileImageHelper';

export function SideNav({ activePage, onNavigate, onSwitchAI, onSettingsClick, selectedUser, onSearchClick }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const [funMenuOpen, setFunMenuOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [isInverted, setIsInverted] = useState(() => {
    const stored = localStorage.getItem('colorInverted');
    return stored === 'true';
  });
  const { currentTitle } = usePersonas();
  
  // Check if selected user is an admin
  const isAdmin = selectedUser?.is_admin === true;

  // Check fullscreen status on mount and listen for changes
  useEffect(() => {
    const checkFullscreen = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    checkFullscreen();
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    document.addEventListener('mozfullscreenchange', checkFullscreen);
    document.addEventListener('MSFullscreenChange', checkFullscreen);
    
    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen);
      document.removeEventListener('webkitfullscreenchange', checkFullscreen);
      document.removeEventListener('mozfullscreenchange', checkFullscreen);
      document.removeEventListener('MSFullscreenChange', checkFullscreen);
    };
  }, []);

  // Apply initial color inversion on mount
  useEffect(() => {
    if (isInverted) {
      document.documentElement.classList.add('color-inverted');
    } else {
      document.documentElement.classList.remove('color-inverted');
    }
  }, [isInverted]);

  // Close all submenus
  const closeAllSubmenus = () => {
    setMediaMenuOpen(false);
    setFunMenuOpen(false);
    setToolsMenuOpen(false);
  };

  // Toggle fullscreen
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        const element = document.documentElement;
        if (element.requestFullscreen) {
          await element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
          await element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
          await element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
          await element.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
    }
  };

  // Toggle color inversion
  const toggleColorInversion = () => {
    const newState = !isInverted;
    setIsInverted(newState);
    localStorage.setItem('colorInverted', newState.toString());
    
    if (newState) {
      document.documentElement.classList.add('color-inverted');
    } else {
      document.documentElement.classList.remove('color-inverted');
    }
  };

  return (
    <div className="side-nav">
      {/* Home - Admin only */}
      {isAdmin && (
        <button
          className={`side-nav-button ${activePage === 'dashboard' ? 'active' : ''}`}
          onClick={() => {
            closeAllSubmenus();
            onNavigate?.('dashboard');
          }}
          title="Home"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
          </svg>
        </button>
      )}

      <button
        className={`side-nav-button ${activePage === 'chat' ? 'active' : ''}`}
        onClick={() => {
          closeAllSubmenus();
          onNavigate?.('chat');
        }}
        title="Chat"
        style={{
          width: '44px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: activePage === 'chat' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          color: activePage === 'chat' ? '#fff' : '#9da7b8',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          if (activePage !== 'chat') {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = '#fff';
          }
        }}
        onMouseLeave={(e) => {
          if (activePage !== 'chat') {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#9da7b8';
          }
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
      </button>

      {/* Media Menu Button */}
      <button
        className={`side-nav-button ${mediaMenuOpen ? 'active' : ''}`}
        onClick={() => {
          const wasOpen = mediaMenuOpen;
          setFunMenuOpen(false);
          setToolsMenuOpen(false);
          if (!wasOpen) {
            setMediaMenuOpen(true);
          } else {
            setMediaMenuOpen(false);
          }
        }}
        title="Media"
        style={{
          width: '44px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: mediaMenuOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          color: mediaMenuOpen ? '#fff' : '#9da7b8',
          transition: 'all 0.2s ease',
          position: 'relative'
        }}
        onMouseEnter={(e) => {
          if (!mediaMenuOpen) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = '#fff';
          }
        }}
        onMouseLeave={(e) => {
          if (!mediaMenuOpen) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#9da7b8';
          }
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          {/* Film strip with perforations */}
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 2v12h16V6H4z"/>
          <path d="M6 8h2v2H6V8zm0 4h2v2H6v-2zm14-4h-2v2h2V8zm0 4h-2v2h2v-2z"/>
          {/* Photo/video frame overlay */}
          <path d="M8 10h8v6H8v-6zm1 1v4h6v-4H9z"/>
          {/* Music note */}
          <path d="M15 3v6.5c-.3-.1-.6-.2-1-.2-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2V7h2V3h-3z"/>
        </svg>
      </button>

      {/* Media Submenu */}
      {mediaMenuOpen && (
        <div className="side-nav-media-submenu">
          <div className="side-nav-media-submenu-header">
            <h3>Media</h3>
            <button
              className="side-nav-media-submenu-close"
              onClick={() => setMediaMenuOpen(false)}
              title="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          <div className="side-nav-media-submenu-items">
            <button
              className={`side-nav-media-submenu-item ${activePage === 'music' ? 'active' : ''}`}
              onClick={() => {
                closeAllSubmenus();
                onNavigate?.('music');
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
              <span>Music</span>
            </button>
            <button
              className={`side-nav-media-submenu-item ${activePage === 'videos' ? 'active' : ''}`}
              onClick={() => {
                closeAllSubmenus();
                onNavigate?.('videos');
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
              <span>Movies</span>
            </button>
            {isAdmin && (
              <>
                <button
                  className={`side-nav-media-submenu-item ${activePage === 'news' ? 'active' : ''}`}
                  onClick={() => {
                    setMediaMenuOpen(false);
                    onNavigate?.('news');
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                  </svg>
                  <span>News</span>
                </button>
                <button
                  className={`side-nav-media-submenu-item ${activePage === 'tech-news' ? 'active' : ''}`}
                  onClick={() => {
                    setMediaMenuOpen(false);
                    onNavigate?.('tech-news');
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H4v-4h11v4zm0-5H4V9h11v4zm5 5h-4V9h4v9z"/>
                  </svg>
                  <span>Tech News</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Fun Menu Button */}
      {isAdmin && (
        <button
          className={`side-nav-button ${funMenuOpen ? 'active' : ''}`}
          onClick={() => {
            const wasOpen = funMenuOpen;
            closeAllSubmenus();
            if (!wasOpen) {
              setFunMenuOpen(true);
            }
          }}
          title="Fun"
          style={{
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: funMenuOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            color: funMenuOpen ? '#fff' : '#9da7b8',
            transition: 'all 0.2s ease',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            if (!funMenuOpen) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.color = '#fff';
            }
          }}
          onMouseLeave={(e) => {
            if (!funMenuOpen) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#9da7b8';
            }
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </button>
      )}

      {/* Fun Submenu */}
      {funMenuOpen && (
        <div className="side-nav-fun-submenu">
          <div className="side-nav-fun-submenu-header">
            <h3>Fun</h3>
            <button
              className="side-nav-fun-submenu-close"
              onClick={closeAllSubmenus}
              title="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          <div className="side-nav-fun-submenu-items">
            <button
              className={`side-nav-fun-submenu-item ${activePage === 'stories' || activePage === 'create-story' ? 'active' : ''}`}
              onClick={() => {
                closeAllSubmenus();
                onNavigate?.('stories');
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
              </svg>
              <span>Stories</span>
            </button>
            <button
              className={`side-nav-fun-submenu-item ${activePage === 'courses' || activePage === 'course-contents' ? 'active' : ''}`}
              onClick={() => {
                closeAllSubmenus();
                onNavigate?.('courses');
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>
              </svg>
              <span>Courses</span>
            </button>
            <button
              className={`side-nav-fun-submenu-item ${activePage === 'games' ? 'active' : ''}`}
              onClick={() => {
                closeAllSubmenus();
                onNavigate?.('games');
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 12c0 .38-.21.71-.53.88l-3.17 1.83c-.16.09-.33.13-.5.13s-.34-.04-.5-.13l-3.17-1.83c-.32-.17-.53-.5-.53-.88V8.12c0-.38.21-.71.53-.88l3.17-1.83c.16-.09.33-.13.5-.13s.34.04.5.13l3.17 1.83c.32.17.53.5.53.88V12zm-4-2.5l2.5 1.44-2.5 1.44v-2.88z"/>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              </svg>
              <span>Games</span>
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Search - absolutely positioned in the center with separators */}
      {(activePage === 'chat' || activePage === 'music' || activePage === 'videos' || activePage === 'tech-news') && (
        <>
          {/* Separator bar above */}
          <div className="side-nav-separator top" />
          <div className="side-nav-search-container">
            <button
              className="side-nav-button"
              onClick={() => {
                closeAllSubmenus();
                // Toggle search overlay (don't close if clicking search icon)
                if (onSearchClick) {
                  onSearchClick();
                }
              }}
              title="Search"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </button>
          </div>
          {/* Separator bar below */}
          <div className="side-nav-separator bottom" />
        </>
      )}


      <button
        className={`side-nav-button ${activePage === 'ai-focus' ? 'active' : ''}`}
        onClick={() => {
          closeAllSubmenus();
          if (onNavigate) {
            onNavigate('ai-focus');
          }
        }}
        title="AI Focus Mode"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
        </svg>
      </button>

      {/* Tools Menu Button */}
      <button
        className={`side-nav-button ${toolsMenuOpen ? 'active' : ''}`}
        onClick={() => {
          const wasOpen = toolsMenuOpen;
          closeAllSubmenus();
          if (!wasOpen) {
            setToolsMenuOpen(true);
          }
        }}
        title="Tools"
        style={{
          width: '44px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: toolsMenuOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          color: toolsMenuOpen ? '#fff' : '#9da7b8',
          transition: 'all 0.2s ease',
          position: 'relative'
        }}
        onMouseEnter={(e) => {
          if (!toolsMenuOpen) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = '#fff';
          }
        }}
        onMouseLeave={(e) => {
          if (!toolsMenuOpen) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#9da7b8';
          }
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
        </svg>
      </button>

      {/* Tools Submenu */}
      {toolsMenuOpen && (
        <div className="side-nav-tools-submenu">
          <div className="side-nav-tools-submenu-header">
            <h3>Tools</h3>
            <button
              className="side-nav-tools-submenu-close"
              onClick={closeAllSubmenus}
              title="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          <div className="side-nav-tools-submenu-items">
            <button
              className="side-nav-tools-submenu-item"
              onClick={() => {
                closeAllSubmenus();
                toggleFullscreen();
              }}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                </svg>
              )}
              <span>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</span>
            </button>
            <button
              className="side-nav-tools-submenu-item"
              onClick={() => {
                closeAllSubmenus();
                toggleColorInversion();
              }}
              title={isInverted ? "Disable Color Inversion" : "Invert Colors"}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
              <span>{isInverted ? "Disable Invert" : "Invert Colors"}</span>
            </button>
            {isAdmin && (
              <button
                className={`side-nav-tools-submenu-item ${activePage === 'alerts' ? 'active' : ''}`}
                onClick={() => {
                  closeAllSubmenus();
                  onNavigate?.('alerts');
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                </svg>
                <span>Alerts</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Admin-only controls */}
      {isAdmin && (
        <>

          <button
            className={`side-nav-button ${activePage === 'settings' ? 'active' : ''}`}
            onClick={() => {
              closeAllSubmenus();
              if (onSettingsClick) onSettingsClick();
            }}
            title="Settings"
          >
            <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z"/>
              <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 001.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 003.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.115l.094-.319z"/>
            </svg>
          </button>
        </>
      )}

      {/* Selected User Profile Picture at Bottom */}
      <div
        className="side-nav-profile"
        onClick={() => {
          closeAllSubmenus();
          onNavigate?.('users');
        }}
        title={selectedUser ? `${selectedUser.name} - Click to go to Users` : 'No user selected - Click to go to Users'}
      >
        {(() => {
          const imageUrl = getProfileImageUrl(selectedUser?.profile_picture, selectedUser?.id);
          console.log(`[SideNav] User ${selectedUser?.id}: profile_picture="${selectedUser?.profile_picture}" -> imageUrl="${imageUrl}"`);
          
          if (imageUrl) {
            return (
              <img 
                key={`sidenav-${selectedUser.id}-${selectedUser.profile_picture}`}
                src={imageUrl}
                alt={selectedUser.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '50%'
                }}
                onError={(e) => {
                  console.error(`[SideNav] Failed to load image: ${imageUrl}`);
                  e.target.style.display = 'none';
                  e.target.parentElement.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                  const name = selectedUser?.name || '';
                  const parts = name.trim().split(' ');
                  const initials = parts.length >= 2 
                    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                    : name.substring(0, 2).toUpperCase();
                  e.target.parentElement.textContent = initials;
                }}
                onLoad={() => {
                  console.log(`[SideNav] Successfully loaded image: ${imageUrl}`);
                }}
              />
            );
          } else if (selectedUser) {
            const name = selectedUser.name || '';
            const parts = name.trim().split(' ');
            const initials = parts.length >= 2 
              ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
              : name.substring(0, 2).toUpperCase();
            return <span>{initials}</span>;
          } else {
            return (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6 }}>
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            );
          }
        })()}
      </div>
    </div>
  );
}
