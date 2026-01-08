import { useUptime } from '../hooks/useSystemStats';

export function Uptime() {
  const { uptime, formatUptime } = useUptime();
  const uptimeFormatted = formatUptime(uptime);

  // Split the formatted string to style numbers and letters differently
  const parts = uptimeFormatted.split(/(\d+)/).filter(Boolean);
  
  return (
    <div className="widget">
      <div className="widget-title">System Uptime</div>
      <div className="uptime-display">
        {parts.map((part, index) => {
          // Check if part is a number
          if (/^\d+$/.test(part)) {
            return <span key={index} className="uptime-number">{part}</span>;
          } else {
            // It's a letter/space
            return <span key={index} className="uptime-label">{part}</span>;
          }
        })}
      </div>
    </div>
  );
}


