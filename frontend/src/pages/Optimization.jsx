import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { getCongestionStatus } from '../services/api';
import SignalControl from '../components/SignalControl';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const WS_URL = BACKEND_URL.replace(/^http/, 'ws') + '/congestion/ws';

// ── Connection badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const styles = {
    connected:    { dot: 'bg-green-500',  text: 'text-green-400',  label: 'Connected' },
    reconnecting: { dot: 'bg-amber-400',  text: 'text-amber-400',  label: 'Reconnecting…' },
    disconnected: { dot: 'bg-slate-500',  text: 'text-slate-400',  label: 'Disconnected' },
  };
  const s = styles[status] ?? styles.disconnected;
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${s.dot} ${status === 'connected' ? 'animate-pulse' : ''}`} />
      <span className={`text-sm font-medium ${s.text}`}>{s.label}</span>
    </div>
  );
}

// ── Snapshot table ────────────────────────────────────────────────────────────
function SnapshotTable({ rows }) {
  if (!rows.length) {
    return (
      <div className="text-slate-500 text-sm italic py-6 text-center">
        No congestion snapshots recorded yet.
      </div>
    );
  }

  const ciColor = (ci) =>
    ci >= 70 ? 'text-red-400' : ci >= 40 ? 'text-amber-400' : 'text-green-400';

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 text-left">Road</th>
            <th className="px-4 py-3 text-left">CI</th>
            <th className="px-4 py-3 text-left">Vehicles</th>
            <th className="px-4 py-3 text-left">Stagnant</th>
            <th className="px-4 py-3 text-left">Recorded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {rows.map((row, i) => (
            <tr key={i} className="bg-slate-900 hover:bg-slate-800 transition-colors">
              <td className="px-4 py-3 text-white font-medium">{row.road_id ?? '—'}</td>
              <td className={`px-4 py-3 font-bold ${ciColor(row.density_index ?? 0)}`}>
                {row.density_index ?? 0}
              </td>
              <td className="px-4 py-3 text-slate-300">{row.vehicle_count ?? 0}</td>
              <td className="px-4 py-3 text-slate-400">{row.stagnant_count ?? 0}</td>
              <td className="px-4 py-3 text-slate-500 text-xs">
                {row.timestamp
                  ? new Date(row.timestamp).toLocaleString(undefined, {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Optimisation result panel ─────────────────────────────────────────────────
function OptimisationPanel({ data }) {
  if (!data) return null;

  const { green_road, green_ci, recommendations = [], computed_at } = data;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-white font-semibold">Latest Optimisation Result</h3>
        {computed_at && (
          <span className="text-slate-500 text-xs">
            {new Date(computed_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      {green_road && (
        <div className="flex items-center gap-3 bg-green-900/30 border border-green-700 rounded-lg px-4 py-2">
          <span className="text-green-400 text-lg">🟢</span>
          <div>
            <p className="text-green-300 text-sm font-semibold">{green_road} — priority green</p>
            <p className="text-green-500 text-xs">CI: {green_ci ?? '—'}</p>
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-slate-400 text-xs uppercase tracking-wide">Time extensions</p>
          {recommendations.map((r) => (
            <div
              key={r.road_id}
              className="flex items-center justify-between bg-slate-700/50 rounded-lg px-4 py-2 text-sm"
            >
              <span className="text-slate-200">{r.road_id}</span>
              <span className="text-slate-400">CI {r.density_index}</span>
              {r.time_extension_s > 0 ? (
                <span className="text-amber-400 font-semibold">+{r.time_extension_s}s</span>
              ) : (
                <span className="text-slate-600 text-xs">no extension</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Optimization() {
  const { data: wsData, status } = useWebSocket(WS_URL);
  const [snapshots, setSnapshots]       = useState([]);
  const [lastUpdated, setLastUpdated]   = useState(null);
  const [roadData, setRoadData]         = useState([]);
  const [optimisation, setOptimisation] = useState(null);

  // Build roadData for SignalControl from WS payload
  useEffect(() => {
    if (!wsData) return;
    setLastUpdated(new Date());
    setOptimisation(wsData);

    if (wsData.recommendations) {
      setRoadData(
        wsData.recommendations.map((r) => ({
          road_id:         r.road_id,
          density_index:   r.density_index,
          vehicle_count:   r.vehicle_count ?? 0,
          time_extension_s: r.time_extension_s ?? 0,
          signal_state:    r.road_id === wsData.green_road ? 'GREEN' : 'RED',
        }))
      );
    }
  }, [wsData]);

  // Seed with REST snapshot history on mount
  const fetchSnapshots = useCallback(async () => {
    try {
      // getCongestionStatus returns the latest optimisation result
      // For history we'd need a dedicated endpoint; fall back to status
      const data = await getCongestionStatus();
      if (data) setOptimisation((prev) => prev ?? data);
    } catch {
      // backend may not be running yet — ignore
    }
  }, []);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  // Accumulate incoming WS snapshots for the history table (cap at 50)
  useEffect(() => {
    if (!wsData?.recommendations) return;
    const ts = wsData.computed_at ?? new Date().toISOString();
    const newRows = wsData.recommendations.map((r) => ({
      road_id:       r.road_id,
      density_index: r.density_index,
      vehicle_count: r.vehicle_count ?? 0,
      stagnant_count: r.stagnant_count ?? 0,
      timestamp:     ts,
    }));
    setSnapshots((prev) => [...newRows, ...prev].slice(0, 50));
  }, [wsData]);

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-6 md:px-8 flex flex-col gap-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-white text-2xl font-bold">Traffic Optimization</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Live smart signal timing — powered by real-time congestion data
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={status} />
          {lastUpdated && (
            <span className="text-slate-500 text-xs">
              Last update: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Live signal control grid */}
      <section className="flex flex-col gap-3">
        <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wider">
          Live Signal Status
        </h2>
        {roadData.length === 0 && status !== 'connected' ? (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-slate-500 text-sm italic">
            Waiting for WebSocket data…
          </div>
        ) : (
          <SignalControl roadData={roadData} />
        )}
      </section>

      {/* Optimisation result */}
      {optimisation && (
        <section className="flex flex-col gap-3">
          <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wider">
            Phase Optimisation
          </h2>
          <OptimisationPanel data={optimisation} />
        </section>
      )}

      {/* Snapshot history table */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wider">
            Recent Congestion Snapshots
          </h2>
          <span className="text-slate-500 text-xs">{snapshots.length} entries</span>
        </div>
        <SnapshotTable rows={snapshots} />
      </section>
    </div>
  );
}
