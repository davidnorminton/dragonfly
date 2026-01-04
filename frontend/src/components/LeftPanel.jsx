import { SystemStats } from './SystemStats';
import { Weather } from './Weather';
import { Traffic } from './Traffic';
import { Uptime } from './Uptime';
import { IPAddress } from './IPAddress';
import { ConnectedDevices } from './ConnectedDevices';
import { DeviceHealth } from './DeviceHealth';
import { NetworkActivity } from './NetworkActivity';
import { QuickStats } from './QuickStats';
import { QuickActions } from './QuickActions';

export function LeftPanel() {
  return (
    <div className="left-panel">
      <SystemStats />
      <Weather />
      <Traffic />
      <IPAddress />
      <ConnectedDevices />
      <DeviceHealth />
      <NetworkActivity />
      <QuickStats />
      <QuickActions />
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

