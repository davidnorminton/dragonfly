import { useState, useEffect } from 'react';
import { deviceAPI } from '../services/api';

export function DeviceHealth() {
  const [health, setHealth] = useState({ total: 0, online: 0, offline: 0, errors: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const data = await deviceAPI.getHealth();
        setHealth(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching device health:', err);
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="widget">
        <div className="widget-title">Device Health</div>
        <div className="widget-content">
          <div className="stat-item">
            <div className="stat-label">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  const healthPercent = health.total > 0 ? Math.round((health.online / health.total) * 100) : 0;

  return (
    <div className="widget">
      <div className="widget-title">Device Health</div>
      <div className="widget-content">
          <div className="stat-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="stat-label">Health</div>
            <div className="stat-value" style={{ color: healthPercent >= 80 ? '#51cf66' : healthPercent >= 50 ? '#ffd43b' : '#ff6b6b' }}>
              {healthPercent}%
            </div>
          </div>
        <div className="health-stats">
          <div className="health-stat">
            <div className="health-stat-label">Online</div>
            <div className="health-stat-value" style={{ color: '#51cf66' }}>{health.online}</div>
          </div>
          <div className="health-stat">
            <div className="health-stat-label">Offline</div>
            <div className="health-stat-value" style={{ color: '#808080' }}>{health.offline}</div>
          </div>
          {health.errors > 0 && (
            <div className="health-stat">
              <div className="health-stat-label">Errors</div>
              <div className="health-stat-value" style={{ color: '#ff6b6b' }}>{health.errors}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

