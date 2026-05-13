import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteViolation, getViolations } from '../services/api';
import ViolationCard from '../components/ViolationCard';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const PAGE_SIZE = 12;

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'RED_LIGHT', label: 'Red Light' },
  { value: 'HELMET', label: 'Helmet' },
  { value: 'SPEED', label: 'Speed' },
];

const typeMeta = {
  RED_LIGHT: { label: 'Red Light', className: 'badge-red', tone: 'var(--red)' },
  HELMET: { label: 'Helmet', className: 'badge-orange', tone: 'var(--orange)' },
  SPEED: { label: 'Speed', className: 'badge-yellow', tone: 'var(--yellow)' },
};

function imageUrl(path) {
  if (!path) return null;
  return `${BACKEND_URL}/${path.replace(/\\/g, '/')}`;
}

function formatDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

function DetailRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{String(value)}</strong>
    </div>
  );
}

function ViolationModal({ violation, onClose, onDelete }) {
  if (!violation) return null;
  const meta = typeMeta[violation.violation_type] || { label: violation.violation_type, className: 'badge-accent', tone: 'var(--accent)' };
  const src = imageUrl(violation.image_path);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <article className="evidence-modal animate-fade-up" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className={`badge ${meta.className}`}>{meta.label}</span>
            <h2>Evidence #{violation.id}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" title="Close">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="evidence-preview">
          {src ? (
            <img src={src} alt="Violation evidence" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
          ) : (
            <span>No evidence image available</span>
          )}
        </div>

        <section className="plate-banner">
          <span>Plate</span>
          <strong>{violation.plate_status === 'plate_not_visible' ? 'Not visible' : violation.plate_text || 'Pending ANPR'}</strong>
          {violation.confidence_score != null && <em>{Math.round(violation.confidence_score * 100)}%</em>}
        </section>

        <section className="detail-grid">
          <DetailRow label="Track ID" value={violation.track_id} />
          <DetailRow label="Timestamp" value={formatDate(violation.timestamp)} />
          <DetailRow label="Road" value={violation.road_id} />
          <DetailRow label="Frame" value={violation.frame_idx} />
          <DetailRow label="Speed" value={violation.speed_kmh != null ? `${violation.speed_kmh.toFixed(1)} km/h` : null} />
          <DetailRow label="Limit" value={violation.speed_limit != null ? `${violation.speed_limit} km/h` : null} />
          <DetailRow label="Bounding box" value={violation.bbox ? JSON.stringify(violation.bbox) : null} />
        </section>

        <footer>
          <button onClick={onClose} className="btn btn-ghost" type="button">Close</button>
          <button onClick={() => onDelete(violation.id)} className="btn btn-danger" type="button">Delete Evidence</button>
        </footer>
      </article>
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop">
      <article className="confirm-card animate-fade-up">
        <h2>Confirm deletion</h2>
        <p>{message}</p>
        <div>
          <button onClick={onCancel} className="btn btn-ghost" type="button">Cancel</button>
          <button onClick={onConfirm} className="btn btn-danger" type="button">Yes, Delete</button>
        </div>
      </article>
    </div>
  );
}

function MetricCard({ label, value, tone, detail }) {
  return (
    <article className="dash-metric-card">
      <div className="metric-card-head">
        <small>{label}</small>
        <span style={{ color: tone }}>Status</span>
      </div>
      <strong style={{ color: tone }}>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

export default function Violations() {
  const [violations, setViolations] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [plate, setPlate] = useState('');
  const [viewMode, setViewMode] = useState('grid');

  const fetchViolations = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (type) params.type = type;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (plate) params.plate = plate;
      const data = await getViolations(params);
      if (Array.isArray(data)) setViolations(data);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, page, plate, type]);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  const stats = useMemo(() => {
    const red = violations.filter((item) => item.violation_type === 'RED_LIGHT').length;
    const helmet = violations.filter((item) => item.violation_type === 'HELMET').length;
    const speed = violations.filter((item) => item.violation_type === 'SPEED').length;
    const plates = violations.filter((item) => item.plate_text).length;
    return { red, helmet, speed, plates };
  }, [violations]);

  const start = page * PAGE_SIZE + 1;
  const end = page * PAGE_SIZE + violations.length;

  function toggleCheck(id) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setCheckedIds(checkedIds.size === violations.length ? new Set() : new Set(violations.map((item) => item.id)));
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
      setDeleteErr(err.response?.data?.detail || err.message || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  }

  function askDelete(ids, label) {
    setConfirm({
      message: `Delete ${label}? This cannot be undone.`,
      onConfirm: () => {
        setConfirm(null);
        doDelete(ids);
      },
    });
  }

  function clearFilters() {
    setType('');
    setDateFrom('');
    setDateTo('');
    setPlate('');
    setPage(0);
  }

  return (
    <div className="violations-page dashboard-page">
      <header className="dashboard-hero violations-hero">
        <div>
          <span className="eyebrow">Evidence review</span>
          <h1>Violation intelligence archive</h1>
          <p>Search, inspect, compare, and curate enforcement records with linked ANPR evidence and event metadata.</p>
        </div>
        <div className="hero-status-card">
          <span className="live-pill"><i style={{ backgroundColor: loading ? 'var(--yellow)' : 'var(--green)' }} /> Evidence DB</span>
          <strong>{violations.length ? `${start}-${end}` : '0'}</strong>
          <small>{loading ? 'Refreshing records' : `Page ${page + 1}`}</small>
        </div>
      </header>

      <section className="dash-metric-grid">
        <MetricCard label="Red-light" value={stats.red} tone="var(--red)" detail="Stop-line crossings" />
        <MetricCard label="Helmet" value={stats.helmet} tone="var(--orange)" detail="Rider safety events" />
        <MetricCard label="Speeding" value={stats.speed} tone="var(--yellow)" detail="Over-limit tracks" />
        <MetricCard label="Plate reads" value={stats.plates} tone="var(--green)" detail="ANPR linked records" />
      </section>

      {deleteErr && (
        <div className="inline-alert danger">
          <span>{deleteErr}</span>
          <button onClick={() => setDeleteErr('')} type="button">Close</button>
        </div>
      )}

      <section className="panel evidence-filter-panel">
        <div className="section-title">
          <div>
            <span>Filters</span>
            <h2>Find evidence fast</h2>
          </div>
          <div className="segmented-control">
            <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')} type="button">Grid</button>
            <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')} type="button">Table</button>
          </div>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); setPage(0); fetchViolations(); }} className="evidence-filters">
          <label>
            <span>Type</span>
            <select value={type} onChange={(event) => { setType(event.target.value); setPage(0); }} className="input-field">
              {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>From</span>
            <input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(0); }} className="input-field" />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(0); }} className="input-field" />
          </label>
          <label>
            <span>Plate</span>
            <input type="text" placeholder="ABC123" value={plate} onChange={(event) => { setPlate(event.target.value.toUpperCase()); setPage(0); }} className="input-field font-mono" />
          </label>
          <div className="filter-actions">
            <button type="submit" className="btn btn-primary">Search</button>
            <button type="button" onClick={clearFilters} className="btn btn-ghost">Clear</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-title">
          <div>
            <span>{loading ? 'Loading' : violations.length === 0 ? 'No matches' : `Showing ${start}-${end}`}</span>
            <h2>Evidence records</h2>
          </div>
          <div className="bulk-actions">
            {selectMode ? (
              <>
                <label>
                  <input type="checkbox" checked={checkedIds.size === violations.length && violations.length > 0} onChange={toggleAll} />
                  All
                </label>
                <button
                  onClick={() => askDelete([...checkedIds], checkedIds.size === 1 ? '1 violation' : `${checkedIds.size} violations`)}
                  disabled={checkedIds.size === 0 || deleting}
                  className="btn btn-danger"
                  type="button"
                >
                  {deleting ? 'Deleting...' : `Delete ${checkedIds.size || ''}`}
                </button>
                <button onClick={exitSelectMode} className="btn btn-ghost" type="button">Cancel</button>
              </>
            ) : (
              <button onClick={() => setSelectMode(true)} disabled={!violations.length} className="btn btn-ghost" type="button">Select Records</button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="dashboard-loading compact"><span className="loader-ring" /><span>Loading violations...</span></div>
        ) : violations.length === 0 ? (
          <div className="empty-state"><span>No violations match your filters.</span></div>
        ) : viewMode === 'grid' ? (
          <div className="evidence-grid">
            {violations.map((violation) => (
              <div key={violation.id} className={`selectable-card ${selectMode && checkedIds.has(violation.id) ? 'selected' : ''}`}>
                <button onClick={() => (selectMode ? toggleCheck(violation.id) : setSelected(violation))} type="button">
                  <ViolationCard violation={violation} />
                </button>
                {selectMode && <span className="selection-check">{checkedIds.has(violation.id) ? 'OK' : ''}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="evidence-table">
            {violations.map((violation) => {
              const meta = typeMeta[violation.violation_type] || { label: violation.violation_type, className: 'badge-accent' };
              return (
                <button key={violation.id} className={selectMode && checkedIds.has(violation.id) ? 'selected' : ''} onClick={() => (selectMode ? toggleCheck(violation.id) : setSelected(violation))} type="button">
                  <span className={`badge ${meta.className}`}>{meta.label}</span>
                  <strong>#{violation.track_id}</strong>
                  <span>{violation.plate_text || violation.plate_status || 'No plate'}</span>
                  <span>{formatDate(violation.timestamp) || '--'}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="pagination-bar">
          <button onClick={() => setPage((prev) => Math.max(0, prev - 1))} disabled={page === 0 || loading} className="btn btn-ghost" type="button">Previous</button>
          <span>Page {page + 1}</span>
          <button onClick={() => setPage((prev) => prev + 1)} disabled={violations.length < PAGE_SIZE || loading} className="btn btn-ghost" type="button">Next</button>
        </div>
      </section>

      <footer className="dashboard-footer">
        <span>TrafficIQ Evidence Desk</span>
        <span>Filter by type, date, plate, and record page</span>
        <span>Deletion requires confirmation</span>
      </footer>

      {!selectMode && <ViolationModal violation={selected} onClose={() => setSelected(null)} onDelete={(id) => { setSelected(null); askDelete([id], 'this violation'); }} />}
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
