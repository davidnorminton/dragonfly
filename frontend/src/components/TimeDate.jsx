import { useState, useEffect } from 'react';

export function TimeDate() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const updateTimeDate = () => {
      const now = new Date();
      
      // Format time: HH:MM:SS
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      // Format date: Day, Month DD, YYYY
      const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      setTime(timeStr);
      setDate(dateStr);
    };

    updateTimeDate();
    const interval = setInterval(updateTimeDate, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="widget">
      <div className="time-date-content">
        <div className="time-display">{time}</div>
        <div className="date-display">{date}</div>
      </div>
    </div>
  );
}
