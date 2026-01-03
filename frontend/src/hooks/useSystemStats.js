import { useState, useEffect } from 'react';
import { systemAPI } from '../services/api';

export function useSystemStats(interval = 15000) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await systemAPI.getStats();
        setStats(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching system stats:', error);
        setLoading(false);
      }
    };

    fetchStats();
    const intervalId = setInterval(fetchStats, interval);

    return () => clearInterval(intervalId);
  }, [interval]);

  return { stats, loading };
}

export function useUptime(interval = 1000) {
  const [uptime, setUptime] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUptime = async () => {
      try {
        const data = await systemAPI.getUptime();
        setUptime(data.uptime_seconds);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching uptime:', error);
        setLoading(false);
      }
    };

    fetchUptime();
    const intervalId = setInterval(fetchUptime, interval);

    return () => clearInterval(intervalId);
  }, [interval]);

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return { uptime, loading, formatUptime };
}

