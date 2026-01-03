import { useState, useEffect } from 'react';
import { locationAPI } from '../services/api';
import { usePersonas } from '../hooks/usePersonas';

export function TopBar({ onSwitchAI }) {
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
        <span className="settings-icon">⚙️</span>
      </div>
    </div>
  );
}
