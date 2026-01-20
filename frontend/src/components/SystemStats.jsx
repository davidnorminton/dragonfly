import { useSystemStats } from '../hooks/useSystemStats';

export function SystemStats() {
  const { stats } = useSystemStats();

  if (!stats) {
    return (
      <div className="widget">
        <div className="widget-title">System Stats</div>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="widget">
      <div className="widget-title">System Stats</div>
      <div className="stat-row">
        <span className="stat-label">CPU Usage</span>
        <span className="stat-value">{stats.cpu_percent.toFixed(1)}%</span>
      </div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${stats.cpu_percent}%` }}
        ></div>
      </div>
      <div className="stat-row">
        <span className="stat-label">RAM Usage</span>
        <span className="stat-value">{stats.memory_used_gb.toFixed(1)}GB</span>
      </div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${stats.memory_percent}%` }}
        ></div>
      </div>
      <div className="stat-row">
        <span className="stat-label">Disk Usage</span>
        <span className="stat-value">{stats.disk_percent.toFixed(1)}%</span>
      </div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${stats.disk_percent}%` }}
        ></div>
      </div>
    </div>
  );
}

