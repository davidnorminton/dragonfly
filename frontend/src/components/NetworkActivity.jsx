import { useState, useEffect } from 'react';
import { networkAPI } from '../services/api';

export function NetworkActivity() {
  const [activity, setActivity] = useState({ 
    websocket_connections: 0,
    active_connections: 0,
    bytes_sent: 0,
    bytes_received: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const data = await networkAPI.getActivity();
        setActivity(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching network activity:', err);
        setLoading(false);
      }
    };

    fetchActivity();
    const interval = setInterval(fetchActivity, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="widget">
        <div className="widget-title">Network Activity</div>
        <div className="widget-content">
          <div className="stat-item">
            <div className="stat-label">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  const statItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };

  return (
    <div className="widget">
      <div className="widget-title">Network Activity</div>
      <div className="widget-content">
        <div className="stat-item" style={statItemStyle}>
          <div className="stat-label">WebSocket Connections</div>
          <div className="stat-value">{activity.websocket_connections || 0}</div>
        </div>
        <div className="stat-item" style={statItemStyle}>
          <div className="stat-label">Active Connections</div>
          <div className="stat-value">{activity.active_connections || 0}</div>
        </div>
        {activity.bytes_sent > 0 && (
          <div className="stat-item" style={statItemStyle}>
            <div className="stat-label">Data Sent</div>
            <div className="stat-value" style={{ fontSize: '0.85em' }}>
              {formatBytes(activity.bytes_sent)}
            </div>
          </div>
        )}
        {activity.bytes_received > 0 && (
          <div className="stat-item" style={statItemStyle}>
            <div className="stat-label">Data Received</div>
            <div className="stat-value" style={{ fontSize: '0.85em' }}>
              {formatBytes(activity.bytes_received)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
