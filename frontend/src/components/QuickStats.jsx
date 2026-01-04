import { useState, useEffect } from 'react';
import { statsAPI } from '../services/api';

export function QuickStats() {
  const [stats, setStats] = useState({
    total_messages: 0,
    data_points: 0,
    ai_queries: 0,
    connected_devices: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await statsAPI.getQuickStats();
        setStats(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching quick stats:', err);
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="widget">
        <div className="widget-title">Quick Stats</div>
        <div className="widget-content">
          <div className="stat-item">
            <div className="stat-label">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  const formatNumber = (num) => {
    if (num === undefined || num === null || isNaN(num)) {
      return '0';
    }
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  return (
    <div className="widget">
      <div className="widget-title">Quick Stats</div>
      <div className="widget-content">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-value">{formatNumber(stats.total_messages)}</div>
            <div className="stat-card-label">Messages</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{formatNumber(stats.data_points)}</div>
            <div className="stat-card-label">Data Points</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{formatNumber(stats.ai_queries)}</div>
            <div className="stat-card-label">AI Queries</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{stats.connected_devices}</div>
            <div className="stat-card-label">Devices</div>
          </div>
        </div>
      </div>
    </div>
  );
}

