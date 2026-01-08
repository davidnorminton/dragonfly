import { SystemStats } from './SystemStats';
import { Weather } from './Weather';
import { Traffic } from './Traffic';
import { Uptime } from './Uptime';
import { IPAddress } from './IPAddress';
import { TimeDate } from './TimeDate';

export function LeftPanel() {
  return (
    <div className="left-panel">
      <TimeDate />
      <Weather />
      <SystemStats />
      <Traffic />
      <IPAddress />
      <Uptime />
    </div>
  );
}

