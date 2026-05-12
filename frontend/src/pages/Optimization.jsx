import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { getCongestionStatus } from '../services/api';
import SignalControl from '../components/SignalControl';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const WS_URL = BACKEND_URL.replace(/^http/, 'ws') + '/congestion/ws';

function StatusBadge({ status }) {
  const cfg = {
    connected:    { dot: 'var(--green)',  text: 'var(--green)',  label: 'Connected'    },
    reconnecting: { dot: 'var(--yellow)', text: 'var(--yellow)', label: 'Reconnecting' },
    disconnected: { dot: 'var(--text-3)', text: 'var(--text-2)', label: 'Disconnected' },
  }[status] ?? { dot: 'var(--text-3)', text: 'var(--text-2)', label: 'Disconnected' };

  return (
    <div className="flex items-center gap-2">
      <span
        className="w-2 h-2 rounded-full"
        style={{
          backgroundColor: cfg.dot,
          animation: status === 'connected' ? 'pulse-dot 1.8s ease-in-out infinite' : 'none',
        }}
      />
      <span className="text-sm font-medium" style={{ color: cfg.text }}>{cfg.label}</span>
    </div>
  );
}

function SnapshotTable({ rows }) {
  if (!rows.length) {
    return (
      <div className="card py-10 text-center text-sm italic" style={{ color: 'var(--text-3)' }}>
        No congestion snapshots recorded yet.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: 'var(--elevated)' }}>
              {['Road', 'CI', 'Vehicles', 'Stagnant', 'Recorded'].map(h => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--text-2)', borderBottom: '1px solid var(--border)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const ci    = row.density_index ?? 0;
              const color = ci >= 70 ? 'var(--red)' : ci >= 40 ? 'var(--orange)' : 'var(--green)';
              return (
                <tr
                  key={i}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--elevated)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
                >
                  <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text)' }}>{row.road_id ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono font-bold" style={{ color }}>{ci}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--text-2)' }}>{row.vehicle_count ?? 0}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--text-2)' }}>{row.stagnant_count ?? 0}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                    {row.timestamp
                      ? new Date(row.timestamp).toLocaleString(undefined, {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OptimisationPanel({ data }) {
  if (!data) return null;
  const { green_road, green_ci, recommendations = [], computed_at } = data;

  return (
    <div className="card p-5 flex flex-col gap-4 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Latest Optimisation Result</h3>
        {computed_at && (
          <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
            {new Date(computed_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      {green_road && (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ backgroundColor: 'var(--green-dim)', border: '1px solid var(--green)' }}
        >
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--green)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--green)' }}>{green_road} — priority green</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>CI: {green_ci ?? '—'}</p>
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>Time Extensions</p>
          {recommendations.map(r => (
            <div
              key={r.road_id}
              className="flex items-center justify-between rounded-xl px-4 py-2.5"
              style={{ backgroundColor: 'var(--elevated)' }}
            >
              <span className="text-sm" style={{ color: 'var(--text)' }}>{r.road_id}</span>
              <span className="text-xs font-mono" style={{ color: 'var(--text-2)' }}>CI {r.density_index}</span>
              {r.time_extension_s > 0 ? (
                <span className="font-mono font-bold text-sm" style={{ color: 'var(--yellow)' }}>+{r.time_extension_s}s</span>
              ) : (
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>no ext</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Optimization() {
  const { data: wsData, status } = useWebSocket(WS_URL);
  const [snapshots,     setSnapshots]     = useState([]);
  const [lastUpdated,   setLastUpdated]   = useState(null);
  const [roadData,      setRoadData]      = useState([]);
  const [optimisation,  setOptimisation]  = useState(null);

  useEffect(() => {
    if (!wsData) return;
    setLastUpdated(new Date());
    setOptimisation(wsData);
    if (wsData.recommendations) {
      setRoadData(wsData.recommendations.map(r => ({
        road_id:          r.road_id,
        density_index:    r.density_index,
        vehicle_count:    r.vehicle_count    ?? 0,
        time_extension_s: r.time_extension_s ?? 0,
        signal_state:     r.road_id === wsData.green_road ? 'GREEN' : 'RED',
      })));
    }
  }, [wsData]);

  const fetchSnapshots = useCallback(async () => {
    try {
      const data = await getCongestionStatus();
      if (data) setOptimisation(prev => prev ?? data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  useEffect(() => {
    if (!wsData?.recommendations) return;
    const ts = wsData.computed_at ?? new Date().toISOString();
    const newRows = wsData.recommendations.map(r => ({
      road_id:       r.road_id,
      density_index: r.density_index,
      vehicle_count: r.vehicle_count   ?? 0,
      stagnant_count: r.stagnant_count ?? 0,
      timestamp:     ts,
    }));
    setSnapshots(prev => [...newRows, ...prev].slice(0, 50));
  }, [wsData]);

  return (
    <div className="flex flex-col gap-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap animate-fade-up">
        <div>
          <h1 className="font-display font-black text-2xl tracking-tight" style={{ color: 'var(--text)' }}>
            Traffic Optimization
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Live smart signal timing — powered by real-time congestion data
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={status} />
          {lastUpdated && (
            <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Signal grid */}
      <section className="animate-fade-up delay-50">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] mb-4" style={{ color: 'var(--text-2)' }}>
          Live Signal Status
        </h2>
        {roadData.length === 0 && status !== 'connected' ? (
          <div className="card py-12 text-center text-sm italic" style={{ color: 'var(--text-3)' }}>
            Waiting for WebSocket data…
          </div>
        ) : (
          <SignalControl roadData={roadData} />
        )}
      </section>

      {/* Optimisation panel */}
      {optimisation && (
        <section className="animate-fade-up delay-100">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] mb-4" style={{ color: 'var(--text-2)' }}>
            Phase Optimisation
          </h2>
          <OptimisationPanel data={optimisation} />
        </section>
      )}

      {/* Snapshot history */}
      <section className="animate-fade-up delay-150">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-2)' }}>
            Congestion Snapshots
          </h2>
          <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{snapshots.length} entries</span>
        </div>
        <SnapshotTable rows={snapshots} />
      </section>
    </div>
  );
}
