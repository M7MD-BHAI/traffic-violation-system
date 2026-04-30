import { useEffect, useState, useCallback, useRef, useId } from 'react';
import { getViolations, getCongestionStatus } from '../services/api';
import ViolationCard from '../components/ViolationCard';

const BACKEND_URL  = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const STREAM_URL   = `${BACKEND_URL}/video/stream`;
const POLL_MS      = 5_000;

const SIGNAL_STYLES = {
  RED:     'bg-red-600 text-white',
  GREEN:   'bg-emerald-500 text-white',
  YELLOW:  'bg-yellow-400 text-black',
  UNKNOWN: 'bg-slate-600 text-slate-300',
};

// ── Stat tile ─────────────────────────────────────────────────────────────────
function StatTile({ label, value, sub }) {
  return (
    <div className="bg-slate-700/60 rounded-xl px-4 py-3 flex flex-col gap-0.5">
      <span className="text-slate-400 text-xs uppercase tracking-wide">{label}</span>
      <span className="text-white font-bold text-xl leading-tight">{value}</span>
      {sub && <span className="text-slate-400 text-xs">{sub}</span>}
    </div>
  );
}

// ── Offline placeholder ───────────────────────────────────────────────────────
function StreamOffline() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-slate-500 h-full min-h-[360px]">
      <svg className="w-16 h-16 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
      </svg>
      <p className="text-sm font-medium">Stream offline</p>
      <p className="text-xs text-slate-600">Check video source — start the backend processor</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LiveFeed() {
  const [streaming, setStreaming]           = useState(false);
  const [streamError, setStreamError]       = useState(false);
  const [violations, setViolations]         = useState([]);
  const [congestion, setCongestion]         = useState(null);
  const [violationCount, setViolationCount] = useState(0);
  const [lastRefresh, setLastRefresh]       = useState(null);

  const pollRef = useRef(null);
  // Key trick: changing imgKey forces React to remount the <img>, restarting the stream
  const [imgKey, setImgKey] = useState(0);

  // ── Poll violations + congestion status ──────────────────────────────────────
  const pollData = useCallback(async () => {
    try {
      const [vData, cData] = await Promise.allSettled([
        getViolations({ limit: 5 }),
        getCongestionStatus(),
      ]);

      if (vData.status === 'fulfilled' && Array.isArray(vData.value)) {
        setViolations(vData.value);
        setViolationCount((prev) => {
          const incoming = vData.value.length;
          return incoming > 0 ? Math.max(prev, incoming) : prev;
        });
      }
      if (cData.status === 'fulfilled' && cData.value) {
        setCongestion(cData.value);
      }
      setLastRefresh(new Date());
    } catch {
      // silently ignore poll errors
    }
  }, []);

  useEffect(() => {
    if (!streaming) return;
    pollData();
    pollRef.current = setInterval(pollData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [streaming, pollData]);

  function startStream() {
    setStreamError(false);
    setImgKey((k) => k + 1);   // force img remount with fresh connection
    setStreaming(true);
  }

  function stopStream() {
    setStreaming(false);
    setStreamError(false);
    clearInterval(pollRef.current);
  }

  // Signal state from congestion aggregator
  const signalState = congestion?.green_road
    ? `${congestion.green_road} — GREEN`
    : 'UNKNOWN';

  const topRoad = congestion?.recommendations?.[0];
  const topCI   = topRoad?.density_index ?? null;

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-6 md:px-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-white text-2xl font-bold">Live Feed</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Processed MJPEG stream with detection overlays
          </p>
        </div>

        {/* Stream status badge */}
        <div className="flex items-center gap-2">
          {streaming && !streamError ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-900/40 border border-emerald-700 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 bg-slate-800 border border-slate-600 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Main layout: video + sidebar */}
      <div className="flex flex-col lg:flex-row gap-4">

        {/* ── Video panel ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden flex flex-col">

          {/* Video area */}
          <div className="relative bg-black flex items-center justify-center min-h-[360px]">
            {streaming ? (
              <>
                <img
                  key={imgKey}
                  src={STREAM_URL}
                  alt="Live stream"
                  className={`w-full h-auto max-h-[560px] object-contain ${streamError ? 'hidden' : 'block'}`}
                  onLoad={() => setStreamError(false)}
                  onError={() => setStreamError(true)}
                />
                {streamError && <StreamOffline />}
              </>
            ) : (
              <StreamOffline />
            )}
          </div>

          {/* Controls bar */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-700 bg-slate-800/80 flex-wrap">
            <div className="flex gap-2">
              <button
                onClick={startStream}
                disabled={streaming && !streamError}
                className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                Start Stream
              </button>
              <button
                onClick={stopStream}
                disabled={!streaming}
                className="px-4 py-1.5 text-sm bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                Stop Stream
              </button>
            </div>

            <span className="text-xs text-slate-500">
              {lastRefresh
                ? `Stats refreshed ${lastRefresh.toLocaleTimeString()}`
                : streaming
                ? 'Connecting…'
                : 'Start stream to begin'}
            </span>
          </div>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="lg:w-64 xl:w-72 flex flex-col gap-4">

          {/* Stats grid */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3">
            <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wide">
              Real-Time Stats
            </h2>

            <StatTile
              label="Stream"
              value={streaming && !streamError ? 'Active' : 'Stopped'}
              sub={streaming && !streamError ? `${BACKEND_URL}/video/stream` : '—'}
            />

            <StatTile
              label="Current FPS"
              value="—"
              sub="reported by backend"
            />

            <StatTile
              label="Active Tracks"
              value="—"
              sub="vehicles in frame"
            />

            <StatTile
              label="Signal (Green Road)"
              value={
                congestion?.green_road
                  ? congestion.green_road.replace(/_/g, ' ')
                  : '—'
              }
              sub={
                congestion?.green_ci != null
                  ? `CI ${congestion.green_ci}`
                  : streaming ? 'Waiting for data…' : '—'
              }
            />

            <StatTile
              label="Highest Congestion"
              value={
                topRoad?.road_id
                  ? topRoad.road_id.replace(/_/g, ' ')
                  : '—'
              }
              sub={topCI != null ? `CI ${topCI}` : '—'}
            />

            <StatTile
              label="Recent Violations"
              value={violations.length > 0 ? violations.length : '—'}
              sub={violations.length > 0 ? 'last fetched' : streaming ? 'Polling…' : '—'}
            />
          </div>

          {/* Signal state panel */}
          {congestion && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3">
              <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wide">
                Signal Optimiser
              </h2>
              <div className="flex flex-col gap-2">
                {congestion.green_road && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs truncate pr-2">
                      {congestion.green_road.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white flex-shrink-0">
                      GREEN
                    </span>
                  </div>
                )}
                {congestion.recommendations?.map((r) => (
                  <div key={r.road_id} className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs truncate pr-2">
                      {r.road_id.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      r.density_index >= 70
                        ? 'bg-red-600 text-white'
                        : r.density_index >= 40
                        ? 'bg-amber-500 text-black'
                        : 'bg-slate-600 text-slate-300'
                    }`}>
                      CI {r.density_index}
                    </span>
                  </div>
                ))}
              </div>
              {congestion.computed_at && (
                <p className="text-slate-600 text-xs">
                  {new Date(congestion.computed_at).toLocaleTimeString()}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent violations ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-lg font-semibold">Recent Detections</h2>
          <span className="text-slate-500 text-xs">
            {streaming ? `Auto-updates every ${POLL_MS / 1000}s` : 'Start stream to enable polling'}
          </span>
        </div>

        {!streaming ? (
          <div className="flex items-center justify-center h-32 text-slate-600 text-sm italic">
            Start the stream to see live violations here
          </div>
        ) : violations.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-500 text-sm italic">
            No violations detected yet in this session
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {violations.map((v) => (
              <ViolationCard key={v.id} violation={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
