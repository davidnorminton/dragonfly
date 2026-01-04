import { useState, useEffect } from 'react';
import { deviceAPI } from '../services/api';

export function ConnectedDevices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const data = await deviceAPI.getDevices();
        setDevices(data || []);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching devices:', err);
        setLoading(false);
      }
    };

    fetchDevices();
    const interval = setInterval(fetchDevices, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const connectedCount = devices.filter(d => d.is_connected).length;

  return (
    <div className="widget">
      <div className="widget-title">Connected Devices</div>
      <div className="widget-content">
        {loading ? (
          <div className="stat-item">
            <div className="stat-label">Loading...</div>
          </div>
        ) : devices.length === 0 ? (
          <div className="stat-item">
            <div className="stat-label">No devices connected</div>
          </div>
        ) : (
          <>
          <div className="stat-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="stat-label">Total Devices</div>
            <div className="stat-value">{devices.length}</div>
          </div>
          <div className="stat-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="stat-label">Online</div>
            <div className="stat-value" style={{ color: connectedCount > 0 ? '#51cf66' : '#808080' }}>
              {connectedCount}
            </div>
          </div>
            <div className="devices-list">
              {devices.slice(0, 5).map((device) => (
                <div key={device.device_id} className="device-item">
                  <div className="device-status" style={{ 
                    backgroundColor: device.is_connected ? '#51cf66' : '#808080' 
                  }}></div>
                  <div className="device-info">
                    <div className="device-name">{device.device_name || device.device_id}</div>
                    <div className="device-type">{device.device_type || 'Unknown'}</div>
                  </div>
                </div>
              ))}
              {devices.length > 5 && (
                <div className="device-more">+{devices.length - 5} more</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

