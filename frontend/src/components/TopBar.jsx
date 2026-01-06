import { useState, useEffect } from 'react';
import { locationAPI } from '../services/api';
import { usePersonas } from '../hooks/usePersonas';

export function TopBar({ onSwitchAI, onSettingsClick, activePage = 'dashboard', onNavigate }) {
  const [currentTime, setCurrentTime] = useState('');
  const [location, setLocation] = useState('Loading...');
  const { currentTitle } = usePersonas();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: true 
      });
      const dateStr = now.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
      setCurrentTime(`${timeStr} | ${dateStr}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    const loadLocation = async () => {
      try {
        const data = await locationAPI.getLocation();
        setLocation(data.display_name || 'Unknown Location');
      } catch (error) {
        console.error('Error loading location:', error);
      }
    };

    loadLocation();

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <div className="logo-text">{currentTitle}</div>
        <div className="top-nav">
          <button
            className={`nav-button ${activePage === 'dashboard' ? 'active' : ''}`}
            onClick={() => onNavigate?.('dashboard')}
            style={{ minWidth: 90 }}
          >
            Dashboard
          </button>
          <button
            className={`nav-button ${activePage === 'music' ? 'active' : ''}`}
            onClick={() => onNavigate?.('music')}
            style={{ minWidth: 90 }}
          >
            Music
          </button>
        </div>
        <button 
          onClick={onSwitchAI}
          style={{
            background: '#667eea',
            border: '1px solid #764ba2',
            color: 'white',
            padding: '6px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85em',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => {
            e.target.style.background = '#764ba2';
          }}
          onMouseOut={(e) => {
            e.target.style.background = '#667eea';
          }}
        >
          Switch AI
        </button>
      </div>
      <div className="top-bar-center">{currentTime}</div>
      <div className="top-bar-right">
        <span>{location}</span>
        <button
          onClick={onSettingsClick}
          className="settings-icon-button"
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
