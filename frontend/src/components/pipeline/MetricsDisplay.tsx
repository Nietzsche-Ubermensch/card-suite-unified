import { useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

interface Metrics {
  activeJobs?: number;
  completedJobs?: number;
  failedJobs?: number;
  throughput?: number; // jobs/min
  connectedClients?: number;
}

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/status`;

export default function MetricsDisplay() {
  const [metrics, setMetrics] = useState<Metrics>({});
  const [connected, setConnected] = useState(false);

  useWebSocket({
    url: WS_URL,
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
    onMessage: (msg) => {
      if (msg.type === 'metrics') {
        setMetrics(msg as Metrics);
      }
    },
  });

  const stat = (label: string, value: string | number | undefined) => (
    <div className="flex flex-col items-center rounded-md border border-border-subtle px-3 py-2 min-w-[72px]">
      <span className="text-lg font-semibold tabular-nums text-text-primary">
        {value ?? '—'}
      </span>
      <span className="text-[10px] text-text-secondary mt-0.5">{label}</span>
    </div>
  );

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Real-time Metrics</h3>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${connected ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
          {connected ? 'Live' : 'Offline'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {stat('Active', metrics.activeJobs)}
        {stat('Done', metrics.completedJobs)}
        {stat('Failed', metrics.failedJobs)}
        {stat('Jobs/min', metrics.throughput?.toFixed(1))}
      </div>
    </div>
  );
}
