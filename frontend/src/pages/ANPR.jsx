import { useState } from 'react';
import { searchPlate, getPlateByTrack } from '../services/api';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

const STATUS_CFG = {
  ok:                { bg: 'var(--green-dim)',  color: 'var(--green)',  label: 'OK'              },
  plate_not_visible: { bg: 'var(--orange-dim)', color: 'var(--orange)', label: 'Plate Not Visible' },
  ocr_failed:        { bg: 'var(--red-dim)',    color: 'var(--red)',    label: 'OCR Failed'      },
  no_plate_found:    { bg: 'var(--elevated)',   color: 'var(--text-2)', label: 'No Plate Found'  },
  empty_crop:        { bg: 'var(--elevated)',   color: 'var(--text-2)', label: 'Empty Crop'      },
};

const VTYPE_CFG = {
  RED_LIGHT: { bg: 'var(--red-dim)',    color: 'var(--red)'    },
  HELMET:    { bg: 'var(--orange-dim)', color: 'var(--orange)' },
  SPEED:     { bg: 'var(--yellow-dim)', color: 'var(--yellow)' },
};

function PlateResultCard({ result }) {
  const {
    track_id, plate_text, confidence_score, status, message, timestamp,
    id: violation_id, violation_type, image_path, speed_kmh, road_id,
  } = result;

  const s    = STATUS_CFG[status] ?? STATUS_CFG.no_plate_found;
  const vCfg = VTYPE_CFG[violation_type];

  return (
    <div className="card overflow-hidden flex flex-col animate-fade-up">
      {image_path && (
        <div className="h-36 flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
          <img
            src={`${BACKEND_URL}${image_path}`} alt="Violation"
            className="h-full w-full object-contain"
            onError={e => { e.target.style.display = 'none'; }}
          />
        </div>
      )}

      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          {plate_text ? (
            <span
              className="font-mono font-bold text-xl tracking-widest px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'var(--elevated)', color: 'var(--text)' }}
            >
              {plate_text}
            </span>
          ) : (
            <span
              className="font-mono text-sm italic px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'var(--elevated)', color: 'var(--text-3)' }}
            >
              Unreadable
            </span>
          )}
          <span className="badge text-[10px]" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
        </div>

        {status === 'plate_not_visible' && message && (
          <div
            className="flex items-start gap-2 rounded-xl px-3 py-2.5"
            style={{ backgroundColor: 'var(--orange-dim)', border: '1px solid var(--orange)', color: 'var(--orange)' }}
          >
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-xs leading-relaxed">{message}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-2)' }}>
          <span>Track <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>#{track_id}</span></span>
          {violation_id && <span>Viol <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>#{violation_id}</span></span>}
          {confidence_score != null && <span>Conf <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{(confidence_score * 100).toFixed(0)}%</span></span>}
          {road_id && <span>Road <span className="font-semibold" style={{ color: 'var(--text)' }}>{road_id}</span></span>}
        </div>

        {vCfg && (
          <div className="flex items-center gap-2">
            <span className="badge text-[10px]" style={{ backgroundColor: vCfg.bg, color: vCfg.color }}>
              {violation_type?.replace('_', ' ')}
            </span>
            {violation_type === 'SPEED' && speed_kmh != null && (
              <span className="font-mono text-xs" style={{ color: 'var(--text-2)' }}>{speed_kmh.toFixed(1)} km/h</span>
            )}
          </div>
        )}

        {timestamp && (
          <p className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
            {new Date(timestamp).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

function TrackLookupResult({ result }) {
  const { track_id, plate_text, confidence_score, status, message, timestamp } = result;
  const s = STATUS_CFG[status] ?? STATUS_CFG.no_plate_found;

  return (
    <div className="card p-5 flex flex-col gap-4 max-w-sm animate-fade-up">
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-2)' }}>
          Track <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>#{track_id}</span>
        </span>
        <span className="badge text-[10px]" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
      </div>

      <div
        className="flex items-center justify-center rounded-xl py-7"
        style={{ backgroundColor: 'var(--elevated)', border: '1px solid var(--border-2)' }}
      >
        {plate_text ? (
          <span className="font-mono font-black text-3xl tracking-[0.25em]" style={{ color: 'var(--text)' }}>
            {plate_text}
          </span>
        ) : (
          <span className="text-sm italic" style={{ color: 'var(--text-3)' }}>No plate text</span>
        )}
      </div>

      {status === 'plate_not_visible' && message && (
        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2.5"
          style={{ backgroundColor: 'var(--orange-dim)', border: '1px solid var(--orange)', color: 'var(--orange)' }}
        >
          <p className="text-xs leading-relaxed">{message}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-2)' }}>
        {confidence_score != null && (
          <span>Confidence <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{(confidence_score * 100).toFixed(0)}%</span></span>
        )}
        {timestamp && (
          <span>Scanned <span className="font-semibold" style={{ color: 'var(--text)' }}>{new Date(timestamp).toLocaleString()}</span></span>
        )}
      </div>
    </div>
  );
}

export default function ANPR() {
  const [mode,        setMode]        = useState('plate');
  const [plateInput,  setPlateInput]  = useState('');
  const [trackInput,  setTrackInput]  = useState('');
  const [results,     setResults]     = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  async function handleSearch(e) {
    e.preventDefault();
    setError(''); setResults(null);

    if (mode === 'plate') {
      const q = plateInput.trim().toUpperCase();
      if (!q) { setError('Enter a plate number to search.'); return; }
      setLoading(true);
      try {
        const data = await searchPlate(q);
        setResults(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.response?.data?.detail ?? 'Search failed.');
      } finally { setLoading(false); }
    } else {
      const id = parseInt(trackInput, 10);
      if (!trackInput.trim() || isNaN(id)) { setError('Enter a valid numeric Track ID.'); return; }
      setLoading(true);
      try {
        const data = await getPlateByTrack(id);
        setResults(data);
      } catch (err) {
        if (err.response?.status === 404) setError(`No ANPR record for Track ID #${id}.`);
        else setError(err.response?.data?.detail ?? 'Lookup failed.');
      } finally { setLoading(false); }
    }
  }

  function switchMode(m) { setMode(m); setResults(null); setError(''); }

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="font-display font-black text-2xl tracking-tight" style={{ color: 'var(--text)' }}>
          ANPR — Plate Lookup
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
          Search for a license plate or look up a specific track ID
        </p>
      </div>

      {/* Search card */}
      <div className="card p-5 flex flex-col gap-4 animate-fade-up delay-50">

        {/* Mode tabs */}
        <div
          className="flex rounded-xl p-1 w-fit gap-1"
          style={{ backgroundColor: 'var(--elevated)' }}
        >
          {[
            { m: 'plate', label: 'Search by Plate' },
            { m: 'track', label: 'Lookup by Track ID' },
          ].map(({ m, label }) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors"
              style={mode === m
                ? { backgroundColor: 'var(--accent)', color: '#04080f' }
                : { color: 'var(--text-2)', backgroundColor: 'transparent' }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSearch} className="flex gap-3 flex-wrap items-end">
          {mode === 'plate' ? (
            <div className="flex flex-col gap-1.5 flex-1 min-w-[200px] max-w-xs">
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>
                License Plate
              </label>
              <input
                type="text" placeholder="e.g. ABC 123"
                value={plateInput} onChange={e => setPlateInput(e.target.value.toUpperCase())}
                className="input-field font-mono tracking-widest"
                autoFocus
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 min-w-[160px]">
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>
                Track ID
              </label>
              <input
                type="number" placeholder="e.g. 42"
                value={trackInput} onChange={e => setTrackInput(e.target.value)}
                min="1" className="input-field font-mono w-40"
                autoFocus
              />
            </div>
          )}

          <div className="flex gap-2 pb-px">
            <button type="submit" disabled={loading} className="btn btn-primary px-5 py-2 text-xs">
              {loading ? 'Searching…' : 'Search'}
            </button>
            {results !== null && (
              <button type="button" onClick={() => { setResults(null); setError(''); }} className="btn btn-ghost px-4 py-2 text-xs">
                Clear
              </button>
            )}
          </div>
        </form>

        {error && (
          <div
            className="text-sm rounded-xl px-4 py-2.5 animate-fade-in"
            style={{ backgroundColor: 'var(--red-dim)', border: '1px solid var(--red)', color: 'var(--red)' }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {results !== null && !loading && (
        <>
          {Array.isArray(results) && (
            <>
              <p className="text-sm animate-fade-in" style={{ color: 'var(--text-2)' }}>
                {results.length === 0 ? 'No records found' : `${results.length} record${results.length !== 1 ? 's' : ''} found`}
              </p>
              {results.length === 0 ? (
                <div className="card flex items-center justify-center h-40 text-sm italic" style={{ color: 'var(--text-3)' }}>
                  No ANPR records match this plate.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {results.map((r, i) => <PlateResultCard key={r.id ?? `${r.track_id}-${i}`} result={r} />)}
                </div>
              )}
            </>
          )}
          {!Array.isArray(results) && (
            <div className="flex flex-col gap-3">
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>ANPR record for Track #{results.track_id}</p>
              <TrackLookupResult result={results} />
            </div>
          )}
        </>
      )}

      {/* Idle */}
      {results === null && !loading && !error && (
        <div className="card flex flex-col items-center justify-center gap-3 h-48">
          <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M7 10h.01M17 10h.01M7 14h10" strokeLinecap="round" />
          </svg>
          <p className="text-sm italic" style={{ color: 'var(--text-3)' }}>Enter a plate or track ID to begin</p>
        </div>
      )}
    </div>
  );
}
