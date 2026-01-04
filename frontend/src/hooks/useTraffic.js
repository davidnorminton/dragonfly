import { useState, useEffect } from 'react';
import { trafficAPI } from '../services/api';

export function useTraffic(interval = 900000, radiusMiles = 30) {
  const [traffic, setTraffic] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTraffic = async () => {
      try {
        const data = await trafficAPI.getTraffic(radiusMiles);
        console.log('=== Waze Traffic API Full Response ===');
        console.log('Complete API Response:', JSON.stringify(data, null, 2));
        console.log('Data object:', data.data);
        console.log('Summary:', data.data?.summary);
        console.log('Location:', data.data?.location);
        console.log('Conditions:', data.data?.conditions);
        console.log('API Status:', data.data?.api_status);
        if (data.data?.conditions) {
          console.log('Alerts:', data.data.conditions.filter(c => c.type === 'alert'));
          console.log('Jams:', data.data.conditions.filter(c => c.type === 'jam'));
        }
        console.log('=====================================');
        
        if (data.success && data.data) {
          setTraffic(data.data);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching traffic:', error);
        setLoading(false);
      }
    };

    fetchTraffic();
    const intervalId = setInterval(fetchTraffic, interval);

    return () => clearInterval(intervalId);
  }, [interval, radiusMiles]);

  return { traffic, loading };
}

