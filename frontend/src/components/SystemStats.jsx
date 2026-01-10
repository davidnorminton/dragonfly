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
      
      {/* Storage Breakdown */}
      <div className="stat-divider"></div>
      <div className="stat-row">
        <span className="stat-label" title={stats.music_dir_path || 'Music Directory'}>
          Music Library
        </span>
        <span className="stat-value">{stats.music_dir_size ?? '...'}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label" title={stats.audio_dir_path || 'Audio Directory'}>
          Generated Audio
        </span>
        <span className="stat-value">{stats.audio_dir_size ?? '...'}</span>
      </div>
    </div>
  );
}

