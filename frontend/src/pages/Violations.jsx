import { useEffect, useState, useCallback } from 'react';
import { getViolations } from '../services/api';
import ViolationCard from '../components/ViolationCard';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const PAGE_SIZE = 12;

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'RED_LIGHT', label: 'Red Light' },
  { value: 'HELMET', label: 'Helmet' },
  { value: 'SPEED', label: 'Speed' },
];

// ── Modal ─────────────────────────────────────────────────────────────────────
function ViolationModal({ violation, onClose }) {
  if (!violation) return null;

  const {
    id, track_id, violation_type, timestamp, image_path,
    plate_text, plate_status, confidence_score, speed_kmh,
    speed_limit, road_id, frame_idx, bbox,
  } = violation;

  const TYPE_COLORS = {
    RED_LIGHT: 'bg-red-600 text-white',
    HELMET: 'bg-orange-500 text-white',
    SPEED: 'bg-yellow-400 text-black',
  };

  function Row({ label, value }) {
    if (value == null || value === '') return null;
    return (
      <div className="flex gap-2 text-sm">
        <span className="text-slate-400 w-36 flex-shrink-0">{label}</span>
        <span className="text-slate-100 break-all">{value}</span>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${TYPE_COLORS[violation_type] ?? 'bg-slate-600 text-white'}`}>
              {violation_type?.replace('_', ' ')}
            </span>
            <span className="text-white font-semibold">Violation #{id}</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Image */}
        <div className="bg-slate-900 flex items-center justify-center min-h-48">
          {image_path ? (
            <img
              src={`${BACKEND_URL}${image_path}`}
              alt="Violation"
              className="max-h-72 w-full object-contain"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <span className="text-slate-500 text-sm italic py-12">No image available</span>
          )}
        </div>

        {/* Details */}
        <div className="px-6 py-5 flex flex-col gap-3">

          {/* Plate result */}
          {plate_status === 'plate_not_visible' ? (
            <div className="flex items-start gap-2 bg-amber-900/40 border border-amber-700 rounded-lg px-4 py-3">
              <span className="text-amber-400 text-lg">⚠️</span>
              <div>
                <p className="text-amber-300 text-sm font-semibold">Plate unreadable</p>
                <p className="text-amber-400 text-xs mt-0.5">
                  Monitor next camera{road_id ? ` on ${road_id}` : ''}.
                </p>
              </div>
            </div>
          ) : plate_text ? (
            <div className="bg-slate-700 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-slate-400 text-xs">Plate</span>
              <span className="text-white font-mono font-bold text-lg">{plate_text}</span>
              {confidence_score != null && (
                <span className="text-slate-400 text-xs ml-auto">
                  {(confidence_score * 100).toFixed(0)}% conf
                </span>
              )}
            </div>
          ) : null}

          {/* Fields */}
          <div className="flex flex-col gap-2 mt-1">
            <Row label="Track ID"     value={track_id} />
            <Row label="Timestamp"    value={timestamp ? new Date(timestamp).toLocaleString() : null} />
            <Row label="Road"         value={road_id} />
            <Row label="Frame"        value={frame_idx} />
            {violation_type === 'SPEED' && (
              <>
                <Row label="Speed"       value={speed_kmh != null ? `${speed_kmh.toFixed(1)} km/h` : null} />
                <Row label="Speed Limit" value={speed_limit != null ? `${speed_limit} km/h` : null} />
              </>
            )}
            <Row label="Bounding Box" value={bbox ? JSON.stringify(bbox) : null} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Violations() {
  const [violations, setViolations] = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(0);
  const [loading, setLoading]       = useState(false);
  const [selected, setSelected]     = useState(null);

  // Filters
  const [type, setType]         = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [plate, setPlate]       = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (type)     params.type      = type;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      if (plate)    params.plate     = plate;

      const data = await getViolations(params);
      // API returns array; total comes from header or we infer from length
      if (Array.isArray(data)) {
        setViolations(data);
        // If we got a full page there may be more; keep total as a lower bound
        setTotal((prev) => {
          const seen = page * PAGE_SIZE + data.length;
          return data.length === PAGE_SIZE ? Math.max(prev, seen + 1) : seen;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [type, dateFrom, dateTo, plate, page]);

  useEffect(() => { fetch(); }, [fetch]);

  function clearFilters() {
    setType('');
    setDateFrom('');
    setDateTo('');
    setPlate('');
    setPage(0);
  }

  function applyFilters(e) {
    e.preventDefault();
    setPage(0);
    fetch();
  }

  const start = page * PAGE_SIZE + 1;
  const end   = page * PAGE_SIZE + violations.length;

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-6 md:px-8 flex flex-col gap-6">

      {/* Header */}
      <div>
        <h1 className="text-white text-2xl font-bold">Violations</h1>
        <p className="text-slate-400 text-sm mt-0.5">Browse, filter, and inspect recorded violations</p>
      </div>

      {/* Filter bar */}
      <form
        onSubmit={applyFilters}
        className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-wrap gap-3 items-end"
      >
        {/* Type */}
        <div className="flex flex-col gap-1">
          <label className="text-slate-400 text-xs uppercase tracking-wide">Type</label>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(0); }}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Date from */}
        <div className="flex flex-col gap-1">
          <label className="text-slate-400 text-xs uppercase tracking-wide">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Date to */}
        <div className="flex flex-col gap-1">
          <label className="text-slate-400 text-xs uppercase tracking-wide">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Plate */}
        <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
          <label className="text-slate-400 text-xs uppercase tracking-wide">Plate</label>
          <input
            type="text"
            placeholder="e.g. ABC123"
            value={plate}
            onChange={(e) => { setPlate(e.target.value.toUpperCase()); setPage(0); }}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
          >
            Search
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
          >
            Clear
          </button>
        </div>
      </form>

      {/* Count + pagination header */}
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm">
          {loading
            ? 'Loading…'
            : violations.length === 0
            ? 'No violations found'
            : `Showing ${start}–${end} violations`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-sm text-slate-400 bg-slate-800 rounded-lg">
            Page {page + 1}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={violations.length < PAGE_SIZE || loading}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
          Loading violations…
        </div>
      ) : violations.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm italic">
          No violations match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {violations.map((v) => (
            <button
              key={v.id}
              className="text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-xl"
              onClick={() => setSelected(v)}
            >
              <ViolationCard violation={v} />
            </button>
          ))}
        </div>
      )}

      {/* Bottom pagination */}
      {violations.length > 0 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={violations.length < PAGE_SIZE || loading}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Detail modal */}
      <ViolationModal violation={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
