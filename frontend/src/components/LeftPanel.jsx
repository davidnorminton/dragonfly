import { SystemStats } from './SystemStats';
import { Weather } from './Weather';
import { Traffic } from './Traffic';
import { Uptime } from './Uptime';
import { IPAddress } from './IPAddress';
import { QuickStats } from './QuickStats';

export function LeftPanel() {
  return (
    <div className="left-panel">
      <SystemStats />
      <Weather />
      <Traffic />
      <IPAddress />
      <QuickStats />
      <Uptime />
    </div>
  );
}

