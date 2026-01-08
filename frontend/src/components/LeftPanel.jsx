import { SystemStats } from './SystemStats';
import { Weather } from './Weather';
import { Traffic } from './Traffic';
import { Uptime } from './Uptime';
import { IPAddress } from './IPAddress';

export function LeftPanel() {
  return (
    <div className="left-panel">
      <SystemStats />
      <Weather />
      <Traffic />
      <IPAddress />
      <Uptime />
    </div>
  );
}

