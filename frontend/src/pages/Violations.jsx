import { useEffect, useState, useCallback } from 'react';
import { getViolations, deleteViolation } from '../services/api';
import ViolationCard from '../components/ViolationCard';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const PAGE_SIZE   = 12;

const TYPE_OPTIONS = [
  { value: '',          label: 'All Types'  },
  { value: 'RED_LIGHT', label: 'Red Light'  },
  { value: 'HELMET',    label: 'Helmet'     },
  { value: 'SPEED',     label: 'Speed'      },
];

// ── Detail Modal ──────────────────────────────────────────────────────────────
function ViolationModal({ violation, onClose, onDelete }) {
  if (!violation) return null;
  const {
    id, track_id, violation_type, timestamp, image_path,
    plate_text, plate_status, confidence_score, speed_kmh,
    speed_limit, road_id, frame_idx, bbox,
  } = violation;

  const TYPE_BADGE = {
    RED_LIGHT: 'badge-red',
    HELMET:    'badge-orange',
    SPEED:     'badge-yellow',
  };

  function Row({ label, value }) {
    if (value == null || value === '') return null;
    return (
      <div className="flex gap-3 text-sm py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="w-32 flex-shrink-0 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>{label}</span>
        <span className="break-all font-mono text-xs" style={{ color: 'var(--text)' }}>{String(value)}</span>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl animate-fade-up"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border-2)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <span className={`badge ${TYPE_BADGE[violation_type] || 'badge-accent'}`}>
              {violation_type?.replace('_', ' ')}
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Violation #{id}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-2)', backgroundColor: 'var(--elevated)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Image */}
        <div className="flex items-center justify-center min-h-40" style={{ backgroundColor: 'var(--bg)' }}>
          {image_path ? (
            <img
              src={`${BACKEND_URL}/${image_path.replace(/\\/g, '/')}`}
              alt="Violation" className="max-h-64 w-full object-contain"
              onError={e => { e.target.style.display = 'none'; }}
            />
          ) : (
            <span className="text-sm italic py-10" style={{ color: 'var(--text-3)' }}>No image available</span>
          )}
        </div>

        {/* Details */}
        <div className="px-5 py-4 flex flex-col gap-1">
          {plate_status === 'plate_not_visible' ? (
            <div
              className="flex items-start gap-2 rounded-xl px-4 py-3 mb-3"
              style={{ backgroundColor: 'var(--orange-dim)', border: '1px solid var(--orange)', color: 'var(--orange)' }}
            >
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-xs font-semibold">Plate unreadable</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                  Monitor next camera{road_id ? ` on ${road_id}` : ''}.
                </p>
              </div>
            </div>
          ) : plate_text ? (
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3 mb-3"
              style={{ backgroundColor: 'var(--elevated)', border: '1px solid var(--border-2)' }}
            >
              <span className="text-xs" style={{ color: 'var(--text-2)' }}>Plate</span>
              <span className="font-mono font-bold text-lg tracking-widest" style={{ color: 'var(--text)' }}>{plate_text}</span>
              {confidence_score != null && (
                <span className="font-mono text-xs ml-auto" style={{ color: 'var(--text-3)' }}>
                  {(confidence_score * 100).toFixed(0)}%
                </span>
              )}
            </div>
          ) : null}

          <Row label="Track ID"    value={track_id} />
          <Row label="Timestamp"   value={timestamp ? new Date(timestamp).toLocaleString() : null} />
          <Row label="Road"        value={road_id} />
          <Row label="Frame"       value={frame_idx} />
          {violation_type === 'SPEED' && (
            <>
              <Row label="Speed"       value={speed_kmh   != null ? `${speed_kmh.toFixed(1)} km/h` : null} />
              <Row label="Speed Limit" value={speed_limit != null ? `${speed_limit} km/h` : null} />
            </>
          )}
          <Row label="Bbox" value={bbox ? JSON.stringify(bbox) : null} />
        </div>

        {/* Footer */}
        <div
          className="px-5 py-4 border-t flex justify-end gap-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <button onClick={onClose} className="btn btn-ghost px-4 py-2">Close</button>
          <button onClick={() => onDelete(id)} className="btn btn-danger px-4 py-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
    >
      <div
        className="rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-up"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border-2)' }}
      >
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{message}</p>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onCancel}  className="btn btn-ghost px-4 py-2">Cancel</button>
          <button onClick={onConfirm} className="btn btn-danger px-4 py-2">Yes, Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Violations() {
  const [violations, setViolations] = useState([]);
  const [page,       setPage]       = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [selected,   setSelected]   = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [deleting,   setDeleting]   = useState(false);
  const [deleteErr,  setDeleteErr]  = useState('');
  const [confirm,    setConfirm]    = useState(null);
  const [type,       setType]       = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [plate,      setPlate]      = useState('');

  const fetchViolations = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (type)     params.type      = type;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      if (plate)    params.plate     = plate;
      const data = await getViolations(params);
      if (Array.isArray(data)) setViolations(data);
    } finally {
      setLoading(false);
    }
  }, [type, dateFrom, dateTo, plate, page]);

  useEffect(() => { fetchViolations(); }, [fetchViolations]);

  function toggleCheck(id) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setCheckedIds(checkedIds.size === violations.length ? new Set() : new Set(violations.map(v => v.id)));
  }
  function exitSelectMode() { setSelectMode(false); setCheckedIds(new Set()); }

  async function doDelete(ids) {
    setDeleting(true); setDeleteErr('');
    try {
      await Promise.all(ids.map(id => deleteViolation(id)));
      setCheckedIds(new Set()); setSelected(null); exitSelectMode();
      await fetchViolations();
    } catch (err) {
      setDeleteErr(err.response?.data?.detail || err.message || 'Delete failed.');
    } finally { setDeleting(false); }
  }

  function askDelete(ids, label) {
    setConfirm({ message: `Delete ${label}? This cannot be undone.`, onConfirm: () => { setConfirm(null); doDelete(ids); } });
  }

  const start = page * PAGE_SIZE + 1;
  const end   = page * PAGE_SIZE + violations.length;

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap animate-fade-up">
        <div>
          <h1 className="font-display font-black text-2xl tracking-tight" style={{ color: 'var(--text)' }}>
            Violations
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Browse, filter, inspect, and delete recorded violations
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none" style={{ color: 'var(--text-2)' }}>
                <input type="checkbox" checked={checkedIds.size === violations.length && violations.length > 0}
                  onChange={toggleAll} className="w-4 h-4 accent-red-500" />
                All
              </label>
              <button
                onClick={() => askDelete([...checkedIds], checkedIds.size === 1 ? '1 violation' : `${checkedIds.size} violations`)}
                disabled={checkedIds.size === 0 || deleting}
                className="btn btn-danger px-3 py-1.5 text-xs"
              >
                {deleting ? 'Deleting…' : `Delete${checkedIds.size > 0 ? ` (${checkedIds.size})` : ''}`}
              </button>
              <button onClick={exitSelectMode} className="btn btn-ghost px-3 py-1.5 text-xs">Cancel</button>
            </>
          ) : (
            <button onClick={() => setSelectMode(true)} disabled={violations.length === 0} className="btn btn-ghost px-3 py-1.5 text-xs">
              Select
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {deleteErr && (
        <div
          className="flex items-center justify-between rounded-xl px-4 py-3 text-sm animate-fade-in"
          style={{ backgroundColor: 'var(--red-dim)', border: '1px solid var(--red)', color: 'var(--red)' }}
        >
          <span>{deleteErr}</span>
          <button onClick={() => setDeleteErr('')} style={{ color: 'var(--red)' }}>×</button>
        </div>
      )}

      {/* Filter bar */}
      <form
        onSubmit={e => { e.preventDefault(); setPage(0); fetchViolations(); }}
        className="card p-4 flex flex-wrap gap-3 items-end animate-fade-up delay-50"
      >
        {[
          { label: 'Type', content: (
            <select value={type} onChange={e => { setType(e.target.value); setPage(0); }} className="input-field" style={{ width: 'auto' }}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )},
          { label: 'From', content: <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} className="input-field" /> },
          { label: 'To',   content: <input type="date" value={dateTo}   onChange={e => { setDateTo(e.target.value);   setPage(0); }} className="input-field" /> },
          { label: 'Plate', content: <input type="text" placeholder="e.g. ABC123" value={plate} onChange={e => { setPlate(e.target.value.toUpperCase()); setPage(0); }} className="input-field font-mono tracking-wider" style={{ minWidth: '140px' }} /> },
        ].map(({ label, content }) => (
          <div key={label} className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>{label}</label>
            {content}
          </div>
        ))}
        <div className="flex gap-2 pb-0.5">
          <button type="submit"   className="btn btn-primary px-4 py-2 text-xs">Search</button>
          <button type="button" onClick={() => { setType(''); setDateFrom(''); setDateTo(''); setPlate(''); setPage(0); }} className="btn btn-ghost px-4 py-2 text-xs">Clear</button>
        </div>
      </form>

      {/* Count + pagination */}
      <div className="flex items-center justify-between flex-wrap gap-2 animate-fade-up delay-100">
        <span className="text-sm" style={{ color: 'var(--text-2)' }}>
          {loading ? 'Loading…' : violations.length === 0 ? 'No violations found' : `Showing ${start}–${end}`}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || loading}
            className="btn btn-ghost px-3 py-1.5 text-xs">Previous</button>
          <span className="text-xs font-mono px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--elevated)', color: 'var(--text-2)' }}>
            {page + 1}
          </span>
          <button onClick={() => setPage(p => p + 1)} disabled={violations.length < PAGE_SIZE || loading}
            className="btn btn-ghost px-3 py-1.5 text-xs">Next</button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48 gap-3" style={{ color: 'var(--text-2)' }}>
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <span className="text-sm">Loading violations…</span>
        </div>
      ) : violations.length === 0 ? (
        <div className="card flex items-center justify-center h-48 text-sm italic" style={{ color: 'var(--text-3)' }}>
          No violations match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-up delay-150">
          {violations.map(v => (
            <div key={v.id} className="relative">
              <button
                className={`w-full text-left focus:outline-none rounded-2xl ${selectMode && checkedIds.has(v.id) ? 'ring-2' : ''}`}
                style={selectMode && checkedIds.has(v.id) ? { outlineColor: 'var(--red)' } : {}}
                onClick={() => selectMode ? toggleCheck(v.id) : setSelected(v)}
              >
                <ViolationCard violation={v} />
              </button>
              {selectMode && (
                <div className="absolute top-2 left-2 pointer-events-none">
                  <div
                    className="w-5 h-5 rounded border-2 flex items-center justify-center"
                    style={checkedIds.has(v.id)
                      ? { backgroundColor: 'var(--red)', borderColor: 'var(--red)' }
                      : { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'var(--border-2)' }}
                  >
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

      {violations.length > 0 && (
        <div className="flex justify-center gap-2 pt-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || loading}
            className="btn btn-ghost px-4 py-2 text-xs">Previous</button>
          <button onClick={() => setPage(p => p + 1)} disabled={violations.length < PAGE_SIZE || loading}
            className="btn btn-ghost px-4 py-2 text-xs">Next</button>
        </div>
      )}

      {!selectMode && <ViolationModal violation={selected} onClose={() => setSelected(null)} onDelete={id => { setSelected(null); askDelete([id], 'this violation'); }} />}
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
