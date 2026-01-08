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
      return '0Y 0M 0D 0H 0M 0S';
    }
    
    const totalSeconds = Math.floor(seconds);
    
    // Constants for time calculations
    const SECONDS_PER_MINUTE = 60;
    const SECONDS_PER_HOUR = 3600;
    const SECONDS_PER_DAY = 86400;
    const SECONDS_PER_MONTH = 30.44 * SECONDS_PER_DAY; // Average days per month
    const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY; // Account for leap years
    
    // Calculate years
    const years = Math.floor(totalSeconds / SECONDS_PER_YEAR);
    let remaining = totalSeconds % SECONDS_PER_YEAR;
    
    // Calculate months
    const months = Math.floor(remaining / SECONDS_PER_MONTH);
    remaining = remaining % SECONDS_PER_MONTH;
    
    // Calculate days
    const days = Math.floor(remaining / SECONDS_PER_DAY);
    remaining = remaining % SECONDS_PER_DAY;
    
    // Calculate hours
    const hours = Math.floor(remaining / SECONDS_PER_HOUR);
    remaining = remaining % SECONDS_PER_HOUR;
    
    // Calculate minutes
    const minutes = Math.floor(remaining / SECONDS_PER_MINUTE);
    
    // Remaining seconds
    const secs = remaining % SECONDS_PER_MINUTE;
    
    // Format as "3Y 3M 3D 3H 3M 3S"
    return `${years}Y ${months}M ${days}D ${hours}H ${minutes}M ${secs}S`;
  };

  return { uptime, loading, formatUptime };
}

