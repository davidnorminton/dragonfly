import { useState, useEffect, useCallback } from 'react';
import { systemAPI } from '../services/api';

const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds

export function useApiHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const checkHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await systemAPI.getApiHealth();
      
      // Check if response has an error field
      if (data.error) {
        setError(data.error);
        // Still set health data if available, so UI can show partial results
        if (data.apis) {
          setHealth(data);
        }
      } else {
        setHealth(data);
        setLastChecked(new Date());
      }
    } catch (err) {
      console.error('Error checking API health:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to check API health';
      setError(errorMessage);
      // Try to set partial health data if available
      if (err.response?.data?.apis) {
        setHealth(err.response.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check on mount
    checkHealth();

    // Check every hour
    const intervalId = setInterval(checkHealth, ONE_HOUR);

    return () => clearInterval(intervalId);
  }, [checkHealth]);

  return { 
    health, 
    loading, 
    error, 
    lastChecked,
    refresh: checkHealth 
  };
}
