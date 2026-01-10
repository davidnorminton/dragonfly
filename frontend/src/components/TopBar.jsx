import { useState, useEffect, useRef } from 'react';
import { usePersonas } from '../hooks/usePersonas';

export function TopBar({ onSwitchAI, onSettingsClick, onAiFocusClick, activePage = 'dashboard', onNavigate, onMusicSearch, onChatSearch, onVideoSearch, musicSearchResults, chatSearchResults, videoSearchResults }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);
  const { currentTitle } = usePersonas();

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show results when there's a query and results
  useEffect(() => {
    const hasQuery = (activePage === 'music' || activePage === 'music-editor') 
      ? searchQuery.trim() 
      : activePage === 'videos'
      ? videoSearchQuery.trim()
      : chatSearchQuery.trim();
    const hasResults = (activePage === 'music' || activePage === 'music-editor') 
      ? (musicSearchResults && musicSearchResults.length > 0)
      : activePage === 'videos'
      ? (videoSearchResults && videoSearchResults.length > 0)
      : (chatSearchResults && chatSearchResults.length > 0);
    setShowResults(hasQuery && hasResults);
  }, [searchQuery, chatSearchQuery, videoSearchQuery, musicSearchResults, chatSearchResults, videoSearchResults, activePage]);

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <div className="top-nav">
          <button
            className={`nav-button ${activePage === 'dashboard' ? 'active' : ''}`}
            onClick={() => onNavigate?.('dashboard')}
            style={{ minWidth: 40, padding: '6px 12px' }}
            title="Home"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
          </button>
          <button
            className={`nav-button ${activePage === 'chat' ? 'active' : ''}`}
            onClick={() => onNavigate?.('chat')}
            style={{ minWidth: 40, padding: '6px 12px' }}
            title="Chat"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
          </button>
          <button
            className={`nav-button ${activePage === 'music' ? 'active' : ''}`}
            onClick={() => onNavigate?.('music')}
            style={{ minWidth: 40, padding: '6px 12px' }}
            title="Music"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          </button>
          <button
            className={`nav-button ${activePage === 'videos' ? 'active' : ''}`}
            onClick={() => onNavigate?.('videos')}
            style={{ minWidth: 40, padding: '6px 12px' }}
            title="Videos"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          </button>
          <button
            className={`nav-button ${activePage === 'news' ? 'active' : ''}`}
            onClick={() => onNavigate?.('news')}
            style={{ minWidth: 40, padding: '6px 12px' }}
            title="News"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
          </button>
        </div>
        <button 
          onClick={onSwitchAI}
          style={{
            background: 'rgb(20, 20, 32)',
            border: 0,
            color: '#534e4e',
            padding: '6px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85em',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => {
            e.target.style.color = '#fff';
          }}
          onMouseOut={(e) => {
            e.target.style.color = '#534e4e';
          }}
        >
          Switch AI
        </button>
      </div>
      <div className="top-bar-center">
        {activePage === 'music' || activePage === 'music-editor' ? (
          <div className="music-search-box" ref={searchRef}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="search-icon">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              type="text"
              placeholder="What do you want to play?"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (onMusicSearch) onMusicSearch(e.target.value);
              }}
              onFocus={() => {
                if (musicSearchResults && musicSearchResults.length > 0 && searchQuery.trim()) {
                  setShowResults(true);
                }
              }}
              className="music-search-input"
            />
            {showResults && musicSearchResults && musicSearchResults.length > 0 && (
              <div className="search-results-dropdown">
                {musicSearchResults.slice(0, 10).map((result, idx) => (
                  <div
                    key={idx}
                    className="search-result-item"
                    onClick={() => {
                      if (result.onClick) result.onClick();
                      setShowResults(false);
                      setSearchQuery('');
                      if (onMusicSearch) onMusicSearch('');
                    }}
                  >
                    {result.image ? (
                      <img src={result.image} alt={result.title} className="search-result-image" onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                      result.icon && <span className="search-result-icon">{result.icon}</span>
                    )}
                    <div className="search-result-content">
                      <div className="search-result-title">{result.title}</div>
                      {result.subtitle && <div className="search-result-subtitle">{result.subtitle}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activePage === 'chat' ? (
          <div className="music-search-box" ref={searchRef}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="search-icon">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              type="text"
              placeholder="Search chats"
              value={chatSearchQuery}
              onChange={(e) => {
                setChatSearchQuery(e.target.value);
                if (onChatSearch) onChatSearch(e.target.value);
              }}
              onFocus={() => {
                if (chatSearchResults && chatSearchResults.length > 0 && chatSearchQuery.trim()) {
                  setShowResults(true);
                }
              }}
              className="music-search-input"
            />
            {showResults && chatSearchResults && chatSearchResults.length > 0 && (
              <div className="search-results-dropdown">
                {chatSearchResults.slice(0, 10).map((result, idx) => (
                  <div
                    key={idx}
                    className="search-result-item search-result-item-chat"
                    onClick={() => {
                      if (result.onClick) result.onClick();
                      setShowResults(false);
                      setChatSearchQuery('');
                      if (onChatSearch) onChatSearch('');
                    }}
                  >
                    <div className="search-result-content">
                      <div className="search-result-title">{result.title}</div>
                      {result.subtitle && <div className="search-result-subtitle">{result.subtitle}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
      <div className="top-bar-right">
        <button
          className={`settings-icon-button ${activePage === 'alerts' ? 'active' : ''}`}
          onClick={() => onNavigate?.('alerts')}
          title="Alerts"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
          </svg>
        </button>
        <button
          onClick={onAiFocusClick || (() => {})}
          className="settings-icon-button"
          title="AI Focus Mode"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
          </svg>
        </button>
        <button
          onClick={onSettingsClick}
          className={`settings-icon-button ${activePage === 'settings' ? 'active' : ''}`}
          title="Settings"
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z"/>
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 001.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 003.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.115l.094-.319z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
