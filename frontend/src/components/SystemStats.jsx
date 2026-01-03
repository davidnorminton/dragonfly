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
      <div className="stat-boxes">
        <div className="stat-box">
          <div className="stat-box-label">CPU</div>
          <div className="stat-box-value">CPU {stats.cpu_percent.toFixed(0)}%</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Memory</div>
          <div className="stat-box-value">Memory {stats.memory_percent.toFixed(0)}%</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Disk</div>
          <div className="stat-box-value">
            Disk {Math.round(stats.disk_used_gb)}/{Math.round(stats.disk_total_gb)} GB
          </div>
        </div>
      </div>
    </div>
  );
}

