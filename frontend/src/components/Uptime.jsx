import { useUptime } from '../hooks/useSystemStats';

export function Uptime() {
  const { uptime, formatUptime } = useUptime();

  return (
    <div className="widget">
      <div className="widget-title">System Uptime</div>
      <div className="uptime-display">{formatUptime(uptime)}</div>
    </div>
  );
}


