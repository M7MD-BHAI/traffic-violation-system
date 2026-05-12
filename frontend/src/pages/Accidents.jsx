import { useEffect, useState, useCallback, useRef } from 'react';
import { getAccidents, resolveAccident } from '../services/api';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const REFRESH_MS  = 15_000;

function AlertRow({ alert, onResolve }) {
  const [resolving, setResolving] = useState(false);

  async function handleResolve() {
    setResolving(true);
    try { await resolveAccident(alert.id); onResolve(alert.id); }
    finally { setResolving(false); }
  }

  const isCrash   = alert.alert_type === 'CRASH';
  const trackList = Array.isArray(alert.track_ids) ? alert.track_ids.join(', ') : String(alert.track_ids ?? '—');

  return (
    <div
      className="card p-4 flex flex-col sm:flex-row sm:items-center gap-4 animate-fade-up"
      style={{
        borderLeftColor: isCrash ? 'var(--red)' : 'var(--orange)',
        borderLeftWidth: '3px',
      }}
    >
      {/* Left */}
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="badge"
            style={isCrash
              ? { backgroundColor: 'var(--red-dim)', color: 'var(--red)' }
              : { backgroundColor: 'var(--orange-dim)', color: 'var(--orange)' }
            }
          >
            {isCrash ? '⚠ CRASH' : '⚡ STAGNATION'}
          </span>
          {alert.resolved ? (
            <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>✓ Resolved</span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--red)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot inline-block" style={{ backgroundColor: 'var(--red)' }} />
              Active
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-2)' }}>Road</p>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>{alert.road_id ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-2)' }}>Track IDs</p>
            <p className="font-mono text-sm" style={{ color: 'var(--text)' }}>#{trackList}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-2)' }}>Time</p>
            <p style={{ color: 'var(--text)' }}>
              {alert.timestamp
                ? new Date(alert.timestamp).toLocaleString(undefined, {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })
                : '—'}
            </p>
          </div>
        </div>

        {alert.clip_path && (
          <a
            href={`${BACKEND_URL}${alert.clip_path}`}
            target="_blank" rel="noreferrer"
            className="text-xs underline w-fit transition-opacity hover:opacity-80"
            style={{ color: 'var(--accent)' }}
          >
            View 3-second clip →
          </a>
        )}
      </div>

      {/* Resolve */}
      {!alert.resolved && (
        <button
          onClick={handleResolve} disabled={resolving}
          className="btn btn-ghost px-4 py-2 text-xs flex-shrink-0"
        >
          {resolving ? 'Resolving…' : 'Mark Resolved'}
        </button>
      )}
    </div>
  );
}

export default function Accidents() {
  const [alerts,       setAlerts]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showAll,      setShowAll]      = useState(true);
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const intervalRef = useRef(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await getAccidents({ limit: 100 });
      if (Array.isArray(data)) {
        setAlerts(data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
        setLastUpdated(new Date());
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAlerts();
    intervalRef.current = setInterval(fetchAlerts, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetchAlerts]);

  function handleResolved(id) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
  }

  const displayed    = showAll ? alerts : alerts.filter(a => !a.resolved);
  const activeCount  = alerts.filter(a => !a.resolved).length;

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap animate-fade-up">
        <div>
          <h1 className="font-display font-black text-2xl tracking-tight" style={{ color: 'var(--text)' }}>
            Accident Alerts
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Crash and stagnation events detected by the pipeline
          </p>
        </div>
        {activeCount > 0 && (
          <div
            className="flex items-center gap-2.5 rounded-xl px-4 py-2 text-sm font-semibold animate-fade-in"
            style={{ backgroundColor: 'var(--red-dim)', border: '1px solid var(--red)', color: 'var(--red)' }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ backgroundColor: 'var(--red)' }} />
            {activeCount} active alert{activeCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap animate-fade-up delay-50">
        <div
          className="flex rounded-xl overflow-hidden border"
          style={{ borderColor: 'var(--border-2)' }}
        >
          {[
            { label: `All (${alerts.length})`,              value: true  },
            { label: `Unresolved (${activeCount})`,         value: false },
          ].map(({ label, value }) => (
            <button
              key={String(value)}
              onClick={() => setShowAll(value)}
              className="px-4 py-2 text-xs font-semibold transition-colors"
              style={showAll === value
                ? { backgroundColor: 'var(--accent)',     color: '#04080f' }
                : { backgroundColor: 'var(--surface)',    color: 'var(--text-2)' }
              }
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          {lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString()} · auto-refreshes every 15s`
            : 'Loading…'}
        </span>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-48 gap-3" style={{ color: 'var(--text-2)' }}>
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <span className="text-sm">Loading alerts…</span>
        </div>
      ) : displayed.length === 0 ? (
        <div className="card flex flex-col items-center justify-center h-48 gap-3">
          <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm italic" style={{ color: 'var(--text-3)' }}>
            {showAll ? 'No alerts recorded.' : 'No active alerts — all clear.'}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayed.map(alert => (
            <AlertRow key={alert.id} alert={alert} onResolve={handleResolved} />
          ))}
        </div>
      )}
    </div>
  );
}
