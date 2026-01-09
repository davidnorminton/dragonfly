import { useState, useEffect, useRef } from 'react';
import { alarmsAPI, configAPI } from '../services/api';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function AlertsPage() {
  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Form state
  const [alarmTime, setAlarmTime] = useState('');
  const [reason, setReason] = useState('');
  const [recurringDays, setRecurringDays] = useState([]); // Array of day numbers (0-6)
  const [isCreating, setIsCreating] = useState(false);
  
  // Active alarm popup
  const [activeAlarm, setActiveAlarm] = useState(null);
  const alarmAudioRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  
  // Default alarm audio file from settings
  const [defaultAlarmAudio, setDefaultAlarmAudio] = useState('');

  useEffect(() => {
    loadAlarms();
    loadDefaultAlarmAudio();
    
    // Check for alarms every 10 seconds
    const interval = setInterval(() => {
      checkAlarms();
    }, 10000);
    
    return () => {
      clearInterval(interval);
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
      }
    };
  }, []);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (alarmAudioRef.current) {
        alarmAudioRef.current.pause();
        alarmAudioRef.current = null;
      }
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
      }
    };
  }, []);

  const loadDefaultAlarmAudio = async () => {
    try {
      const data = await configAPI.getSystemConfig();
      setDefaultAlarmAudio(data?.alarm_audio_file || '');
    } catch (err) {
      console.error('Error loading default alarm audio:', err);
    }
  };

  const loadAlarms = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await alarmsAPI.getAlarms();
      if (result.success) {
        setAlarms(result.alarms || []);
      } else {
        setError(result.error || 'Failed to load alarms');
      }
    } catch (err) {
      console.error('Error loading alarms:', err);
      setError(err.message || 'Failed to load alarms');
    } finally {
      setLoading(false);
    }
  };

  const checkAlarms = async () => {
    try {
      const result = await alarmsAPI.checkAlarms();
      if (result.success && result.alarms && result.alarms.length > 0) {
        // Trigger alarms
        for (const alarm of result.alarms) {
          triggerAlarm(alarm);
        }
        // Reload alarms list
        await loadAlarms();
      }
    } catch (err) {
      console.error('Error checking alarms:', err);
    }
  };

  const triggerAlarm = (alarm) => {
    console.log('Triggering alarm:', alarm);
    
    // Set active alarm for popup
    setActiveAlarm(alarm);
    
    // Play repeating audio
    const audioFile = alarm.audio_file || defaultAlarmAudio;
    
    if (audioFile) {
      const audio = new Audio(audioFile);
      audio.loop = true;
      alarmAudioRef.current = audio;
      
      audio.play().catch(err => {
        console.error('Error playing alarm audio:', err);
        // Fallback to default sound
        playDefaultAlarmSound();
      });
    } else {
      // Default alarm sound - repeating pattern
      playDefaultAlarmSound();
    }
    
    // Show browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Alarm', {
        body: alarm.reason || 'Alarm triggered',
        icon: '/vite.svg'
      });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification('Alarm', {
            body: alarm.reason || 'Alarm triggered',
            icon: '/vite.svg'
          });
        }
      });
    }
  };

  const playDefaultAlarmSound = () => {
    // Stop any existing sound
    if (alarmAudioRef.current) {
      alarmAudioRef.current.pause();
    }
    
    // Create repeating beep pattern
    const playBeep = () => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    };
    
    // Play beep pattern every 1.5 seconds
    playBeep();
    alarmIntervalRef.current = setInterval(() => {
      playBeep();
    }, 1500);
  };

  const stopAlarm = () => {
    if (alarmAudioRef.current) {
      alarmAudioRef.current.pause();
      alarmAudioRef.current.currentTime = 0;
      alarmAudioRef.current = null;
    }
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    setActiveAlarm(null);
  };

  const toggleDay = (dayIndex) => {
    setRecurringDays(prev => {
      if (prev.includes(dayIndex)) {
        return prev.filter(d => d !== dayIndex);
      } else {
        return [...prev, dayIndex].sort();
      }
    });
  };

  const handleCreateAlarm = async () => {
    if (!alarmTime) {
      setError('Time is required');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsCreating(true);

    try {
      // Create a datetime object with today's date and the selected time
      const now = new Date();
      const [hours, minutes] = alarmTime.split(':');
      const alarmDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hours), parseInt(minutes));
      
      // For recurring alarms, recurring_days will be set
      // For one-time alarms, recurring_days will be null
      const result = await alarmsAPI.createAlarm({
        alarm_type: 'time',
        alarm_time: alarmDateTime.toISOString(),
        reason: reason.trim() || null,
        recurring_days: recurringDays.length > 0 ? recurringDays : null
      });

      if (result.success) {
        setSuccess('Alarm created successfully');
        setAlarmTime('');
        setReason('');
        setRecurringDays([]);
        setIsCreating(false);
        await loadAlarms();
      } else {
        setError(result.error || 'Failed to create alarm');
        setIsCreating(false);
      }
    } catch (err) {
      console.error('Error creating alarm:', err);
      setError(err.message || 'Failed to create alarm');
      setIsCreating(false);
    }
  };

  const handleDeleteAlarm = async (alarmId) => {
    if (!confirm('Are you sure you want to delete this alarm?')) {
      return;
    }

    try {
      const result = await alarmsAPI.deleteAlarm(alarmId);
      if (result.success) {
        setSuccess('Alarm deleted successfully');
        await loadAlarms();
      } else {
        setError(result.error || 'Failed to delete alarm');
      }
    } catch (err) {
      console.error('Error deleting alarm:', err);
      setError(err.message || 'Failed to delete alarm');
    }
  };

  const handleToggleAlarm = async (alarmId) => {
    try {
      const result = await alarmsAPI.toggleAlarm(alarmId);
      if (result.success) {
        await loadAlarms();
      } else {
        setError(result.error || 'Failed to toggle alarm');
      }
    } catch (err) {
      console.error('Error toggling alarm:', err);
      setError(err.message || 'Failed to toggle alarm');
    }
  };

  // Format alarm time for display
  const formatAlarmTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // Format recurring days
  const formatRecurringDays = (days) => {
    if (!days || days.length === 0) return 'Once';
    if (days.length === 7) return 'Every day';
    return days.map(d => DAYS_OF_WEEK[d]).join(', ');
  };

  return (
    <div className="alerts-page">
      {/* Alarm Popup Modal */}
      {activeAlarm && (
        <div className="alarm-popup-overlay">
          <div className="alarm-popup">
            <div className="alarm-popup-icon">🔔</div>
            <div className="alarm-popup-title">Alarm</div>
            <div className="alarm-popup-message">
              {activeAlarm.reason || 'Alarm'}
            </div>
            <div className="alarm-popup-time">
              {formatAlarmTime(activeAlarm.alarm_time)}
            </div>
            <button className="alarm-popup-stop" onClick={stopAlarm}>
              Stop
            </button>
          </div>
        </div>
      )}

      <div className="alerts-container">
        <div className="alerts-header">
          <h2>Alarms</h2>
        </div>

        {/* Create Alarm Form - Android Style */}
        <div className="alarm-card">
          <div className="alarm-card-header">
            <h3>New Alarm</h3>
          </div>
          
          {error && <div className="alerts-message error">{error}</div>}
          {success && <div className="alerts-message success">{success}</div>}
          
          <div className="alarm-form-android">
            {/* Time Picker */}
            <div className="alarm-time-picker">
              <input
                type="time"
                value={alarmTime}
                onChange={(e) => setAlarmTime(e.target.value)}
                className="alarm-time-input"
                required
              />
            </div>
            
            {/* Reason Input */}
            <div className="alarm-input-group">
              <label>Label</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Alarm name"
                className="alarm-text-input"
              />
            </div>
            
            {/* Recurring Days */}
            <div className="alarm-input-group">
              <label>Repeat</label>
              <div className="alarm-days-selector">
                {DAYS_OF_WEEK.map((day, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`alarm-day-button ${recurringDays.includes(index) ? 'active' : ''}`}
                    onClick={() => toggleDay(index)}
                  >
                    {day[0]}
                  </button>
                ))}
              </div>
              {recurringDays.length === 0 && (
                <div className="alarm-hint">Tap days to repeat, or leave empty for one-time alarm</div>
              )}
            </div>
            
            {/* Create Button */}
            <button
              onClick={handleCreateAlarm}
              disabled={isCreating || !alarmTime}
              className="alarm-create-button"
            >
              {isCreating ? 'Creating...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Alarms List - Android Style */}
        <div className="alarms-list-android">
          {loading && <div className="loading">Loading alarms...</div>}
          
          {!loading && alarms.length === 0 && (
            <div className="alerts-empty">No alarms set</div>
          )}
          
          {!loading && alarms.map((alarm) => (
            <div key={alarm.id} className={`alarm-card-compact ${!alarm.is_active ? 'inactive' : ''}`}>
              <div className="alarm-time-display-compact">
                {formatAlarmTime(alarm.alarm_time)}
              </div>
              <div className="alarm-details-compact">
                {alarm.reason && (
                  <div className="alarm-label-compact">{alarm.reason}</div>
                )}
                <div className="alarm-repeat-compact">
                  {formatRecurringDays(alarm.recurring_days)}
                </div>
              </div>
              <div className="alarm-actions-compact">
                <label className="android-switch-compact">
                  <input
                    type="checkbox"
                    checked={alarm.is_active}
                    onChange={() => handleToggleAlarm(alarm.id)}
                  />
                  <span className="android-switch-slider-compact"></span>
                </label>
                <button
                  className="alarm-delete-icon-compact"
                  onClick={() => handleDeleteAlarm(alarm.id)}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
