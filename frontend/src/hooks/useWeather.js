import { useState, useEffect } from 'react';
import { weatherAPI } from '../services/api';

export function useWeather(interval = 600000) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const data = await weatherAPI.getWeather();
        if (data.success && data.data) {
          setWeather(data.data);
          console.log('=== RapidAPI Open Weather API Data ===');
          Object.entries(data.data).forEach(([key, value]) => {
            console.log(`${key}:`, value);
          });
          console.log('======================================');
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching weather:', error);
        setLoading(false);
      }
    };

    fetchWeather();
    const intervalId = setInterval(fetchWeather, interval);

    return () => clearInterval(intervalId);
  }, [interval]);

  return { weather, loading };
}


