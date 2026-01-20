import { useSystemStats } from '../hooks/useSystemStats';

export function StorageSizes() {
  const { stats } = useSystemStats();

  if (!stats) {
    return (
      <div className="widget">
        <div className="widget-title">Storage</div>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="widget">
      <div className="widget-title">Storage</div>
      <div className="stat-row">
        <span className="stat-label" title={stats.music_dir_path || 'Music Directory'}>
          Music Library
        </span>
        <span className="stat-value">{stats.music_dir_size ?? '...'}</span>
      </div>
      {stats.database_size && stats.database_size !== '0 B' && (
        <div className="stat-row stat-subrow">
          <span className="stat-label stat-sublabel">└ Database</span>
          <span className="stat-value stat-subvalue">{stats.database_size}</span>
        </div>
      )}
      <div className="stat-row">
        <span className="stat-label" title={stats.audio_dir_path || 'Audio Directory'}>
          Generated Audio
        </span>
        <span className="stat-value">{stats.audio_dir_size ?? '...'}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label" title={stats.video_dir_path || 'Video Directory'}>
          Movie Library
        </span>
        <span className="stat-value">{stats.video_dir_size ?? '...'}</span>
      </div>
      {stats.database_size && stats.database_size !== '0 B' && (
        <div className="stat-row stat-subrow">
          <span className="stat-label stat-sublabel">└ Database</span>
          <span className="stat-value stat-subvalue">{stats.database_size}</span>
        </div>
      )}
      
      {/* Total Database Size */}
      {stats.database_size && stats.database_size !== '0 B' && (
        <>
          <div className="stat-divider"></div>
          <div className="stat-row">
            <span className="stat-label">Database Size</span>
            <span className="stat-value">{stats.database_size}</span>
          </div>
        </>
      )}
    </div>
  );
}
