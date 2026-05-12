import { useEffect, useState, useCallback } from 'react';
import { getViolations, deleteViolation } from '../services/api';
import ViolationCard from '../components/ViolationCard';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const PAGE_SIZE = 12;

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'RED_LIGHT', label: 'Red Light' },
  { value: 'HELMET', label: 'Helmet' },
  { value: 'SPEED', label: 'Speed' },
];

// ── Detail Modal ──────────────────────────────────────────────────────────────
function ViolationModal({ violation, onClose, onDelete }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
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
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Image */}
        <div className="bg-slate-900 flex items-center justify-center min-h-48">
          {image_path ? (
            <img
              src={`${BACKEND_URL}/${image_path.replace(/\\/g, '/')}`}
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
          {plate_status === 'plate_not_visible' ? (
            <div className="flex items-start gap-2 bg-amber-900/40 border border-amber-700 rounded-lg px-4 py-3">
              <span className="text-amber-400 text-lg">⚠️</span>
              <div>
                <p className="text-amber-300 text-sm font-semibold">Plate unreadable</p>
                <p className="text-amber-400 text-xs mt-0.5">Monitor next camera{road_id ? ` on ${road_id}` : ''}.</p>
              </div>
            </div>
          ) : plate_text ? (
            <div className="bg-slate-700 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-slate-400 text-xs">Plate</span>
              <span className="text-white font-mono font-bold text-lg">{plate_text}</span>
              {confidence_score != null && (
                <span className="text-slate-400 text-xs ml-auto">{(confidence_score * 100).toFixed(0)}% conf</span>
              )}
            </div>
          ) : null}

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

        {/* Footer with delete */}
        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
            Close
          </button>
          <button onClick={() => onDelete(id)}
            className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Violation
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <p className="text-white text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3 mt-5 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors">
            Yes, Delete
          </button>
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
  const [selected, setSelected]     = useState(null);   // detail modal

  // Select mode
  const [selectMode, setSelectMode]   = useState(false);
  const [checkedIds, setCheckedIds]   = useState(new Set());
  const [deleting, setDeleting]       = useState(false);
  const [deleteErr, setDeleteErr]     = useState('');
  const [confirm, setConfirm]         = useState(null);  // { message, onConfirm }

  // Filters
  const [type, setType]         = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [plate, setPlate]       = useState('');

  const fetchViolations = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (type)     params.type      = type;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      if (plate)    params.plate     = plate;
      const data = await getViolations(params);
      if (Array.isArray(data)) {
        setViolations(data);
        setTotal((prev) => {
          const seen = page * PAGE_SIZE + data.length;
          return data.length === PAGE_SIZE ? Math.max(prev, seen + 1) : seen;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [type, dateFrom, dateTo, plate, page]);

  useEffect(() => { fetchViolations(); }, [fetchViolations]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function toggleCheck(id) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (checkedIds.size === violations.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(violations.map((v) => v.id)));
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setCheckedIds(new Set());
  }

  async function doDelete(ids) {
    setDeleting(true);
    setDeleteErr('');
    try {
      await Promise.all(ids.map((id) => deleteViolation(id)));
      setCheckedIds(new Set());
      setSelected(null);
      exitSelectMode();
      await fetchViolations();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Delete failed.';
      setDeleteErr(msg);
    } finally {
      setDeleting(false);
    }
  }

  function askDelete(ids, label) {
    setConfirm({
      message: `Delete ${label}? This cannot be undone.`,
      onConfirm: () => { setConfirm(null); doDelete(ids); },
    });
  }

  function handleModalDelete(id) {
    setSelected(null);
    askDelete([id], 'this violation');
  }

  function handleBatchDelete() {
    if (checkedIds.size === 0) return;
    askDelete(
      [...checkedIds],
      checkedIds.size === 1
        ? '1 violation'
        : `${checkedIds.size} violations`,
    );
  }

  function clearFilters() {
    setType(''); setDateFrom(''); setDateTo(''); setPlate(''); setPage(0);
  }

  const allChecked = violations.length > 0 && checkedIds.size === violations.length;
  const start = page * PAGE_SIZE + 1;
  const end   = page * PAGE_SIZE + violations.length;

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-6 md:px-8 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-white text-2xl font-bold">Violations</h1>
          <p className="text-slate-400 text-sm mt-0.5">Browse, filter, inspect, and delete recorded violations</p>
        </div>

        {/* Select / Delete controls */}
        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              {/* Select all */}
              <label className="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-red-500"
                />
                All
              </label>

              {/* Delete selected */}
              <button
                onClick={handleBatchDelete}
                disabled={checkedIds.size === 0 || deleting}
                className="px-3 py-1.5 text-sm bg-red-700 hover:bg-red-600 disabled:opacity-40
                           disabled:cursor-not-allowed text-white font-semibold rounded-lg
                           transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {deleting ? 'Deleting…' : `Delete${checkedIds.size > 0 ? ` (${checkedIds.size})` : ''}`}
              </button>

              {/* Cancel */}
              <button onClick={exitSelectMode}
                className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors">
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              disabled={violations.length === 0}
              className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40
                         disabled:cursor-not-allowed text-white rounded-lg transition-colors
                         flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Select
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {deleteErr && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <span>{deleteErr}</span>
          <button onClick={() => setDeleteErr('')} className="text-red-400 hover:text-white text-lg leading-none">×</button>
        </div>
      )}

      {/* Filter bar */}
      <form
        onSubmit={(e) => { e.preventDefault(); setPage(0); fetchViolations(); }}
        className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-wrap gap-3 items-end"
      >
        <div className="flex flex-col gap-1">
          <label className="text-slate-400 text-xs uppercase tracking-wide">Type</label>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(0); }}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-slate-400 text-xs uppercase tracking-wide">From</label>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-slate-400 text-xs uppercase tracking-wide">To</label>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
          <label className="text-slate-400 text-xs uppercase tracking-wide">Plate</label>
          <input type="text" placeholder="e.g. ABC123" value={plate}
            onChange={(e) => { setPlate(e.target.value.toUpperCase()); setPage(0); }}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500" />
        </div>

        <div className="flex gap-2">
          <button type="submit"
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors">
            Search
          </button>
          <button type="button" onClick={clearFilters}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors">
            Clear
          </button>
        </div>
      </form>

      {/* Count + pagination */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-slate-400 text-sm">
          {loading ? 'Loading…' : violations.length === 0 ? 'No violations found' : `Showing ${start}–${end} violations`}
        </span>
        <div className="flex gap-2">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
            Previous
          </button>
          <span className="px-3 py-1.5 text-sm text-slate-400 bg-slate-800 rounded-lg">Page {page + 1}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={violations.length < PAGE_SIZE || loading}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
            Next
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm">Loading violations…</div>
      ) : violations.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-sm italic">No violations match your filters.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {violations.map((v) => (
            <div key={v.id} className="relative group">
              <button
                className={`w-full text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-xl
                  ${selectMode && checkedIds.has(v.id) ? 'ring-2 ring-red-500' : ''}`}
                onClick={() => selectMode ? toggleCheck(v.id) : setSelected(v)}
              >
                <ViolationCard violation={v} />
              </button>

              {/* Checkbox overlay in select mode */}
              {selectMode && (
                <div className="absolute top-2 left-2 pointer-events-none">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center
                    ${checkedIds.has(v.id) ? 'bg-red-600 border-red-600' : 'bg-slate-900/80 border-slate-400'}`}>
                    {checkedIds.has(v.id) && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bottom pagination */}
      {violations.length > 0 && (
        <div className="flex justify-center gap-2 pt-2">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
            Previous
          </button>
          <button onClick={() => setPage((p) => p + 1)} disabled={violations.length < PAGE_SIZE || loading}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
            Next
          </button>
        </div>
      )}

      {/* Detail modal */}
      {!selectMode && (
        <ViolationModal
          violation={selected}
          onClose={() => setSelected(null)}
          onDelete={handleModalDelete}
        />
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
