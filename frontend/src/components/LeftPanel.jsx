import { SystemStats } from './SystemStats';
import { Weather } from './Weather';
import { Uptime } from './Uptime';

export function LeftPanel() {
  return (
    <div className="left-panel">
      <SystemStats />
      <Weather />
      <div className="widget">
        <div className="widget-title">Camera</div>
        <div className="camera-preview">Camera preview</div>
        <div style={{ fontSize: '0.8em', color: '#808080', textAlign: 'center' }}>
          Screen sharing active, C.Y.B.E.R will analyze your screen.
        </div>
      </div>
      <Uptime />
    </div>
  );
}

