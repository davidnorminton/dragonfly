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

export function useUptime() {
  const [uptime, setUptime] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let incrementTimer;
    let refreshTimer;
    let cancelled = false;

    const fetchUptime = async () => {
      try {
        const data = await systemAPI.getUptime();
        if (!cancelled && data?.uptime_seconds !== undefined) {
          setUptime(data.uptime_seconds);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching uptime:', error);
          setLoading(false);
        }
      }
    };

    // Initial fetch
    fetchUptime();

    // Increment locally every second
    incrementTimer = setInterval(() => {
      setUptime((prev) => (typeof prev === 'number' ? prev + 1 : prev));
    }, 1000);

    // Refresh from server once per hour to correct drift
    refreshTimer = setInterval(fetchUptime, 60 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(incrementTimer);
      clearInterval(refreshTimer);
    };
  }, []);

  const formatUptime = (seconds) => {
    if (seconds === undefined || seconds === null || isNaN(seconds)) {
      return '00:00:00';
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return { uptime, loading, formatUptime };
}

