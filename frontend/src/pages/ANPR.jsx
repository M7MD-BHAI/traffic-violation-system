import { useState } from 'react';
import { searchPlate, getPlateByTrack } from '../services/api';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

const STATUS_STYLES = {
  ok:                'bg-emerald-900/50 text-emerald-400 border-emerald-700',
  plate_not_visible: 'bg-amber-900/50 text-amber-400 border-amber-700',
  ocr_failed:        'bg-red-900/50 text-red-400 border-red-700',
  no_plate_found:    'bg-slate-700 text-slate-400 border-slate-600',
  empty_crop:        'bg-slate-700 text-slate-400 border-slate-600',
};

const STATUS_LABELS = {
  ok:                'OK',
  plate_not_visible: 'Plate Not Visible',
  ocr_failed:        'OCR Failed',
  no_plate_found:    'No Plate Found',
  empty_crop:        'Empty Crop',
};

const VIOLATION_COLORS = {
  RED_LIGHT: 'bg-red-600 text-white',
  HELMET:    'bg-orange-500 text-white',
  SPEED:     'bg-yellow-400 text-black',
};

// ── Result card for plate search (PlateResult + ViolationOut combined) ────────
function PlateResultCard({ result }) {
  const {
    track_id, plate_text, confidence_score, status, message, timestamp,
    // violation fields (may be present from search endpoint)
    id: violation_id, violation_type, image_path, speed_kmh, road_id,
  } = result;

  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.no_plate_found;
  const statusLabel = STATUS_LABELS[status] ?? status;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex flex-col">

      {/* Violation image (if present) */}
      {image_path && (
        <div className="bg-slate-900 flex items-center justify-center h-40">
          <img
            src={`${BACKEND_URL}${image_path}`}
            alt="Violation"
            className="h-full w-full object-contain"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
      )}

      <div className="p-4 flex flex-col gap-3">

        {/* Plate text */}
        <div className="flex items-center gap-3">
          {plate_text ? (
            <span className="font-mono font-bold text-xl text-white tracking-widest bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-500">
              {plate_text}
            </span>
          ) : (
            <span className="font-mono text-base text-slate-500 italic bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-600">
              Unreadable
            </span>
          )}
          <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${statusStyle}`}>
            {statusLabel}
          </span>
        </div>

        {/* plate_not_visible warning */}
        {status === 'plate_not_visible' && message && (
          <div className="flex items-start gap-2 bg-amber-900/30 border border-amber-700 rounded-lg px-3 py-2">
            <span className="text-amber-400 mt-0.5 flex-shrink-0">!</span>
            <p className="text-amber-300 text-xs leading-relaxed">{message}</p>
          </div>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>Track <span className="text-slate-200 font-medium">#{track_id}</span></span>
          {violation_id && (
            <span>Violation <span className="text-slate-200 font-medium">#{violation_id}</span></span>
          )}
          {confidence_score != null && (
            <span>Conf <span className="text-slate-200 font-medium">{(confidence_score * 100).toFixed(0)}%</span></span>
          )}
          {road_id && (
            <span>Road <span className="text-slate-200 font-medium">{road_id}</span></span>
          )}
        </div>

        {/* Violation type + speed */}
        {violation_type && (
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${VIOLATION_COLORS[violation_type] ?? 'bg-slate-600 text-white'}`}>
              {violation_type.replace('_', ' ')}
            </span>
            {violation_type === 'SPEED' && speed_kmh != null && (
              <span className="text-xs text-slate-400">{speed_kmh.toFixed(1)} km/h</span>
            )}
          </div>
        )}

        {/* Timestamp */}
        {timestamp && (
          <p className="text-xs text-slate-500">
            {new Date(timestamp).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Single track lookup result ─────────────────────────────────────────────────
function TrackLookupResult({ result }) {
  const { track_id, plate_text, confidence_score, status, message, timestamp } = result;
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.no_plate_found;
  const statusLabel = STATUS_LABELS[status] ?? status;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-4 max-w-md">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm">Track ID <span className="text-white font-bold">#{track_id}</span></span>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${statusStyle}`}>
          {statusLabel}
        </span>
      </div>

      {plate_text ? (
        <div className="flex items-center justify-center bg-slate-900 border border-slate-600 rounded-xl py-5">
          <span className="font-mono font-bold text-3xl text-white tracking-[0.25em]">
            {plate_text}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-center bg-slate-900 border border-slate-600 rounded-xl py-5">
          <span className="text-slate-500 italic text-sm">No plate text available</span>
        </div>
      )}

      {status === 'plate_not_visible' && message && (
        <div className="flex items-start gap-2 bg-amber-900/30 border border-amber-700 rounded-lg px-3 py-2">
          <span className="text-amber-400 mt-0.5 flex-shrink-0">!</span>
          <p className="text-amber-300 text-xs leading-relaxed">{message}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        {confidence_score != null && (
          <span>Confidence <span className="text-slate-200 font-medium">{(confidence_score * 100).toFixed(0)}%</span></span>
        )}
        {timestamp && (
          <span>Scanned <span className="text-slate-200 font-medium">{new Date(timestamp).toLocaleString()}</span></span>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ANPR() {
  const [mode, setMode]           = useState('plate');   // 'plate' | 'track'
  const [plateInput, setPlateInput] = useState('');
  const [trackInput, setTrackInput] = useState('');
  const [results, setResults]     = useState(null);      // array (plate) or object (track)
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    setResults(null);

    if (mode === 'plate') {
      const q = plateInput.trim().toUpperCase();
      if (!q) { setError('Enter a plate number to search.'); return; }
      setLoading(true);
      try {
        const data = await searchPlate(q);
        setResults(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.response?.data?.detail ?? 'Search failed. Please try again.');
      } finally {
        setLoading(false);
      }
    } else {
      const id = parseInt(trackInput, 10);
      if (!trackInput.trim() || isNaN(id)) { setError('Enter a valid numeric Track ID.'); return; }
      setLoading(true);
      try {
        const data = await getPlateByTrack(id);
        setResults(data);
      } catch (err) {
        if (err.response?.status === 404) {
          setError(`No ANPR record found for Track ID #${id}.`);
        } else {
          setError(err.response?.data?.detail ?? 'Lookup failed. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    }
  }

  function handleModeSwitch(newMode) {
    setMode(newMode);
    setResults(null);
    setError('');
  }

  const plateResultsCount = Array.isArray(results) ? results.length : null;

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-6 md:px-8 flex flex-col gap-6">

      {/* Header */}
      <div>
        <h1 className="text-white text-2xl font-bold">ANPR — Plate Lookup</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Search for a license plate or look up the ANPR result for a specific track ID
        </p>
      </div>

      {/* Search card */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-4">

        {/* Mode tabs */}
        <div className="flex gap-1 bg-slate-900 rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => handleModeSwitch('plate')}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
              mode === 'plate'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Search by Plate
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('track')}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
              mode === 'track'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Lookup by Track ID
          </button>
        </div>

        {/* Input */}
        <form onSubmit={handleSearch} className="flex gap-3 flex-wrap items-end">
          {mode === 'plate' ? (
            <div className="flex flex-col gap-1 flex-1 min-w-[200px] max-w-sm">
              <label className="text-slate-400 text-xs uppercase tracking-wide">
                License Plate
              </label>
              <input
                type="text"
                placeholder="e.g. ABC 123"
                value={plateInput}
                onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                className="bg-slate-700 border border-slate-600 text-white font-mono text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500 tracking-widest"
                autoFocus
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-slate-400 text-xs uppercase tracking-wide">
                Track ID
              </label>
              <input
                type="number"
                placeholder="e.g. 42"
                value={trackInput}
                onChange={(e) => setTrackInput(e.target.value)}
                min="1"
                className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500 w-40"
                autoFocus
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>

          {results !== null && (
            <button
              type="button"
              onClick={() => { setResults(null); setError(''); }}
              className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
            >
              Clear
            </button>
          )}
        </form>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>

      {/* Results */}
      {results !== null && !loading && (
        <>
          {/* Plate search results */}
          {Array.isArray(results) && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">
                  {plateResultsCount === 0
                    ? 'No records found'
                    : `${plateResultsCount} record${plateResultsCount !== 1 ? 's' : ''} found`}
                </span>
              </div>

              {plateResultsCount === 0 ? (
                <div className="flex items-center justify-center h-40 text-slate-500 text-sm italic">
                  No ANPR records match this plate number.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {results.map((r, i) => (
                    <PlateResultCard key={r.id ?? `${r.track_id}-${i}`} result={r} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Track lookup result (single object) */}
          {!Array.isArray(results) && (
            <div className="flex flex-col gap-3">
              <span className="text-slate-400 text-sm">ANPR record for Track #{results.track_id}</span>
              <TrackLookupResult result={results} />
            </div>
          )}
        </>
      )}

      {/* Idle state */}
      {results === null && !loading && !error && (
        <div className="flex flex-col items-center justify-center gap-3 h-48 text-slate-600">
          <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M7 10h.01M17 10h.01M7 14h10" strokeLinecap="round" />
          </svg>
          <p className="text-sm italic">Enter a plate number or track ID to begin</p>
        </div>
      )}
    </div>
  );
}
