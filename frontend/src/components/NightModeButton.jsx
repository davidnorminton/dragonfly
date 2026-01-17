import { useState, useEffect } from 'react';
import { alarmsAPI } from '../services/api';
import '../styles/night-mode-button.css';

export function NightModeButton() {
  const [isNightMode, setIsNightMode] = useState(() => {
    const stored = localStorage.getItem('nightMode');
    return stored === 'true';
  });
  const [showOverlay, setShowOverlay] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [upcomingAlarms, setUpcomingAlarms] = useState([]);

  // Update time every minute when overlay is shown
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setCurrentTime(`${hours}:${minutes}`);
    };

    updateTime(); // Set initial time
    if (showOverlay) {
      // Update every minute instead of every second
      const interval = setInterval(updateTime, 60000);
      return () => clearInterval(interval);
    }
  }, [showOverlay]);

  // Fetch upcoming alarms when overlay is shown
  useEffect(() => {
    const fetchUpcomingAlarms = async () => {
      if (!showOverlay) {
        setUpcomingAlarms([]);
        return;
      }

      try {
        const result = await alarmsAPI.getAlarms();
        if (result.success && result.alarms) {
          const now = new Date();
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          
          const upcoming = result.alarms
            .filter(alarm => {
              // Filter active alarms only
              if (!alarm.is_active || alarm.triggered) {
                return false;
              }

              const alarmDate = new Date(alarm.alarm_time);
              
              // Check if alarm is within next 24 hours
              if (alarmDate >= now && alarmDate <= tomorrow) {
                return true;
              }

              // For recurring alarms, check if alarm time today or tomorrow matches
              if (alarm.recurring_days && Array.isArray(alarm.recurring_days)) {
                const alarmTime = new Date(alarm.alarm_time);
                const alarmHours = alarmTime.getHours();
                const alarmMinutes = alarmTime.getMinutes();
                
                // Check today
                const today = new Date(now);
                today.setHours(alarmHours, alarmMinutes, 0, 0);
                const todayDayOfWeek = (today.getDay() + 6) % 7; // Convert to 0=Monday, 6=Sunday
                if (alarm.recurring_days.includes(todayDayOfWeek) && today >= now && today <= tomorrow) {
                  return true;
                }
                
                // Check tomorrow
                const tomorrowCheck = new Date(today);
                tomorrowCheck.setDate(tomorrowCheck.getDate() + 1);
                const tomorrowDayOfWeek = (tomorrowCheck.getDay() + 6) % 7;
                if (alarm.recurring_days.includes(tomorrowDayOfWeek) && tomorrowCheck <= tomorrow) {
                  return true;
                }
              }

              return false;
            })
            .map(alarm => {
              const alarmDate = new Date(alarm.alarm_time);
              
              // For recurring alarms, determine the next occurrence
              if (alarm.recurring_days && Array.isArray(alarm.recurring_days)) {
                const alarmTime = new Date(alarm.alarm_time);
                const alarmHours = alarmTime.getHours();
                const alarmMinutes = alarmTime.getMinutes();
                
                // Check today
                const today = new Date(now);
                today.setHours(alarmHours, alarmMinutes, 0, 0);
                const todayDayOfWeek = (today.getDay() + 6) % 7;
                if (alarm.recurring_days.includes(todayDayOfWeek) && today >= now) {
                  return { ...alarm, displayTime: today };
                }
                
                // Check tomorrow
                const tomorrowCheck = new Date(today);
                tomorrowCheck.setDate(tomorrowCheck.getDate() + 1);
                const tomorrowDayOfWeek = (tomorrowCheck.getDay() + 6) % 7;
                if (alarm.recurring_days.includes(tomorrowDayOfWeek)) {
                  return { ...alarm, displayTime: tomorrowCheck };
                }
              }
              
              return { ...alarm, displayTime: alarmDate };
            })
            .sort((a, b) => a.displayTime - b.displayTime); // Sort by time

          setUpcomingAlarms(upcoming);
        }
      } catch (err) {
        console.error('[Night Mode] Error fetching alarms:', err);
        setUpcomingAlarms([]);
      }
    };

    fetchUpcomingAlarms();
  }, [showOverlay]);

  const toggleNightMode = () => {
    const newMode = !isNightMode;
    setIsNightMode(newMode);
    localStorage.setItem('nightMode', newMode.toString());
    
    // Show overlay when activating night mode
    if (newMode) {
      setShowOverlay(true);
    } else {
      setShowOverlay(false);
    }
  };

  return (
    <>
      {/* Night mode overlay */}
      {showOverlay && (
        <div className="night-mode-overlay" onClick={() => setShowOverlay(false)}>
          <div className="night-mode-content">
            <div className="night-mode-time">{currentTime}</div>
            
            {/* Upcoming Alarms */}
            {upcomingAlarms.length > 0 && (
              <div className="night-mode-alarms">
                {upcomingAlarms.map((alarm) => {
                  const displayTime = alarm.displayTime || new Date(alarm.alarm_time);
                  const hours = displayTime.getHours().toString().padStart(2, '0');
                  const minutes = displayTime.getMinutes().toString().padStart(2, '0');
                  const timeStr = `${hours}:${minutes}`;
                  
                  return (
                    <div key={alarm.id} className="night-mode-alarm-item">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="night-mode-alarm-icon">
                        {/* Alarm clock bell */}
                        <path d="M12 6v6l4 2"/>
                        <circle cx="12" cy="12" r="9"/>
                        <path d="M19.5 9.5c-1.5 0-2.5 1-2.5 2.5"/>
                        <path d="M4.5 9.5c1.5 0 2.5 1 2.5 2.5"/>
                      </svg>
                      <div className="night-mode-alarm-time">{timeStr}</div>
                    </div>
                  );
                })}
              </div>
            )}
            
            <button
              className="night-mode-overlay-button"
              onClick={(e) => {
                e.stopPropagation();
                toggleNightMode();
              }}
              title="Switch to day mode"
              aria-label="Switch to day mode"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Night mode button */}
      <button
        className="night-mode-button"
        onClick={toggleNightMode}
        title={isNightMode ? "Switch to day mode" : "Switch to night mode"}
        aria-label={isNightMode ? "Switch to day mode" : "Switch to night mode"}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {/* Always show moon icon */}
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>
    </>
  );
}
