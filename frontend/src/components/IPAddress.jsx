import { useState, useEffect } from 'react';
import { systemAPI } from '../services/api';

export function IPAddress() {
  const [ips, setIps] = useState({ local_ip: '', remote_ip: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIPs = async () => {
      try {
        const data = await systemAPI.getIPs();
        setIps(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching IP addresses:', err);
        setLoading(false);
      }
    };

    fetchIPs();
  }, []);

  if (loading) {
    return (
      <div className="widget">
        <div className="widget-title">Network IPs</div>
        <div className="widget-content">
          <div className="stat-item">
            <div className="stat-label">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="widget">
      <div className="widget-title">Network IPs</div>
      <div className="widget-content">
        <div className="stat-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="stat-label">Local IP</div>
          <div className="stat-value">{ips.local_ip || 'Unknown'}</div>
        </div>
        <div className="stat-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="stat-label">Remote IP</div>
          <div className="stat-value">{ips.remote_ip || 'Unknown'}</div>
        </div>
      </div>
    </div>
  );
}

