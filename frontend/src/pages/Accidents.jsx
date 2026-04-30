import { useEffect, useState, useCallback, useRef } from 'react';
import { getAccidents, resolveAccident } from '../services/api';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const REFRESH_MS  = 15_000;

// ── Badge ─────────────────────────────────────────────────────────────────────
function AlertBadge({ type }) {
  if (type === 'CRASH') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">
        ⚠ CRASH
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-black">
      ⚡ STAGNATION
    </span>
  );
}

// ── Single alert row ──────────────────────────────────────────────────────────
function AlertRow({ alert, onResolve }) {
  const [resolving, setResolving] = useState(false);

  async function handleResolve() {
    setResolving(true);
    try {
      await resolveAccident(alert.id);
      onResolve(alert.id);
    } finally {
      setResolving(false);
    }
  }

  const trackList = Array.isArray(alert.track_ids)
    ? alert.track_ids.join(', ')
    : String(alert.track_ids ?? '—');

  const borderColor = alert.alert_type === 'CRASH'
    ? 'border-red-700'
    : 'border-amber-600';

  const bgColor = alert.alert_type === 'CRASH'
    ? 'bg-red-950/40'
    : 'bg-amber-950/30';

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4 flex flex-col sm:flex-row sm:items-center gap-4`}>

      {/* Left — badge + meta */}
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <AlertBadge type={alert.alert_type} />
          {alert.resolved ? (
            <span className="text-xs text-green-400 font-semibold">✓ Resolved</span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-red-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
              Active
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-slate-400 text-xs">Road</span>
            <p className="text-white font-medium">{alert.road_id ?? '—'}</p>
          </div>
          <div>
            <span className="text-slate-400 text-xs">Track IDs</span>
            <p className="text-white font-mono">#{trackList}</p>
          </div>
          <div>
            <span className="text-slate-400 text-xs">Time</span>
            <p className="text-white">
              {alert.timestamp
                ? new Date(alert.timestamp).toLocaleString(undefined, {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })
                : '—'}
            </p>
          </div>
        </div>

        {/* Clip preview link */}
        {alert.clip_path && (
          <a
            href={`${BACKEND_URL}${alert.clip_path}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 underline w-fit"
          >
            View 3-second clip →
          </a>
        )}
      </div>

      {/* Right — resolve button */}
      {!alert.resolved && (
        <button
          onClick={handleResolve}
          disabled={resolving}
          className="flex-shrink-0 px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {resolving ? 'Resolving…' : 'Mark Resolved'}
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Accidents() {
  const [alerts, setAlerts]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showAll, setShowAll]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await getAccidents({ limit: 100 });
      if (Array.isArray(data)) {
        setAlerts(data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    intervalRef.current = setInterval(fetchAlerts, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetchAlerts]);

  function handleResolved(id) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, resolved: true } : a))
    );
  }

  const displayed = showAll ? alerts : alerts.filter((a) => !a.resolved);
  const activeCount = alerts.filter((a) => !a.resolved).length;

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-6 md:px-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-white text-2xl font-bold">Accident Alerts</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Crash and stagnation events detected by the pipeline
          </p>
        </div>

        {/* Active count pill */}
        {activeCount > 0 && (
          <div className="flex items-center gap-2 bg-red-900/50 border border-red-700 rounded-xl px-4 py-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-300 text-sm font-semibold">
              {activeCount} active alert{activeCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">

        {/* Filter toggle */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          <button
            onClick={() => setShowAll(true)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              showAll
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Show All ({alerts.length})
          </button>
          <button
            onClick={() => setShowAll(false)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              !showAll
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Unresolved Only ({activeCount})
          </button>
        </div>

        {/* Last updated */}
        <span className="text-slate-500 text-xs">
          {lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString()} · auto-refreshes every 15s`
            : 'Loading…'}
        </span>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
          Loading alerts…
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-500">
          <span className="text-4xl">✓</span>
          <span className="text-sm italic">
            {showAll ? 'No alerts recorded.' : 'No active alerts — all clear.'}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayed.map((alert) => (
            <AlertRow key={alert.id} alert={alert} onResolve={handleResolved} />
          ))}
        </div>
      )}
    </div>
  );
}
