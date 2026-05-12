import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getViolations, getCongestionStatus, getVideoStats,
  uploadVideo, getFirstFrameUrl, saveCalibration,
} from '../services/api';
import ViolationCard from '../components/ViolationCard';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const STREAM_URL  = `${BACKEND_URL}/video/stream`;
const POLL_MS     = 2_000;

const SIGNAL_COLOR = {
  RED:     { bg: 'var(--red-dim)',    color: 'var(--red)'    },
  GREEN:   { bg: 'var(--green-dim)',  color: 'var(--green)'  },
  YELLOW:  { bg: 'var(--yellow-dim)', color: 'var(--yellow)' },
  UNKNOWN: { bg: 'var(--elevated)',   color: 'var(--text-2)' },
};

const MIN_CALIBRATION_DISTANCE = 10;

function distance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Step badge ────────────────────────────────────────────────────────────────
function StepBadge({ n, label, active, done }) {
  const bg    = done ? 'var(--green)'  : active ? 'var(--accent)' : 'var(--elevated)';
  const color = done ? '#04080f'       : active ? '#04080f'       : 'var(--text-3)';
  const tc    = done ? 'var(--green)'  : active ? 'var(--text)'   : 'var(--text-3)';
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: bg, color }}>
        {done ? '✓' : n}
      </div>
      <span className="text-xs font-medium" style={{ color: tc }}>{label}</span>
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function StatTile({ label, value, sub, accentColor }) {
  return (
    <div className="rounded-xl px-4 py-3 flex flex-col gap-0.5" style={{ backgroundColor: 'var(--elevated)' }}>
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>{label}</span>
      <span className="font-mono font-bold text-lg leading-tight" style={{ color: accentColor || 'var(--text)' }}>{value}</span>
      {sub && <span className="text-xs" style={{ color: 'var(--text-3)' }}>{sub}</span>}
    </div>
  );
}

// ── Stream offline placeholder ────────────────────────────────────────────────
function StreamOffline() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 h-full min-h-[360px]" style={{ color: 'var(--text-3)' }}>
      <svg className="w-14 h-14 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
      </svg>
      <p className="text-sm font-medium">Stream offline</p>
    </div>
  );
}

// ── Canvas drawing helpers (unchanged logic) ──────────────────────────────────
function drawCalibration(canvas, img, clicks, polygon) {
  if (!canvas || !img) return;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const dot = (x, y, color, r = 7) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
  };

  if (clicks.length >= 1) dot(clicks[0][0], clicks[0][1], '#f87171');
  if (clicks.length >= 2) {
    dot(clicks[1][0], clicks[1][1], '#f87171');
    ctx.strokeStyle = '#f87171'; ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath(); ctx.moveTo(clicks[0][0], clicks[0][1]); ctx.lineTo(clicks[1][0], clicks[1][1]); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f87171'; ctx.font = 'bold 14px monospace';
    const mx = (clicks[0][0] + clicks[1][0]) / 2;
    const my = (clicks[0][1] + clicks[1][1]) / 2 - 14;
    ctx.fillText('STOP LINE', mx - 34, my);
  }

  if (clicks.length >= 3) dot(clicks[2][0], clicks[2][1], '#fb923c');
  if (clicks.length >= 4) {
    dot(clicks[3][0], clicks[3][1], '#fb923c');
    const x1 = Math.min(clicks[2][0], clicks[3][0]);
    const y1 = Math.min(clicks[2][1], clicks[3][1]);
    const w  = Math.abs(clicks[3][0] - clicks[2][0]);
    const h  = Math.abs(clicks[3][1] - clicks[2][1]);
    ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, w, h);
    ctx.fillStyle = 'rgba(251,146,60,0.12)'; ctx.fillRect(x1, y1, w, h);
    ctx.fillStyle = '#fb923c'; ctx.font = 'bold 13px monospace';
    ctx.fillText('SIGNAL ROI', x1, y1 - 8);
  }

  if (polygon && polygon.length >= 2) {
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i][0], polygon[i][1]);
    if (polygon.length >= 3) ctx.closePath();
    ctx.stroke();
    if (polygon.length >= 3) {
      ctx.fillStyle = 'rgba(56,189,248,0.12)'; ctx.fill();
      ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 12px monospace';
      ctx.fillText('MONITORED ZONE', polygon[0][0] + 4, polygon[0][1] - 8);
    }
    polygon.forEach(pt => dot(pt[0], pt[1], '#38bdf8', 5));
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LiveFeed() {
  const [step,         setStep]         = useState('upload');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadErr,    setUploadErr]    = useState('');
  const [clicks,       setClicks]       = useState([]);
  const [frameSize,    setFrameSize]    = useState({ w: 640, h: 360 });
  const [savingCal,    setSavingCal]    = useState(false);
  const [calErr,       setCalErr]       = useState('');
  const canvasRef = useRef(null);
  const imgRef    = useRef(null);
  const [polygon,      setPolygon]      = useState([]);
  const [savingPoly,   setSavingPoly]   = useState(false);
  const [polyErr,      setPolyErr]      = useState('');
  const [streaming,    setStreaming]    = useState(false);
  const [streamError,  setStreamError]  = useState(false);
  const [imgKey,       setImgKey]       = useState(0);
  const [violations,   setViolations]   = useState([]);
  const [congestion,   setCongestion]   = useState(null);
  const [videoStats,   setVideoStats]   = useState(null);
  const [lastRefresh,  setLastRefresh]  = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (step !== 'calibrate') return;
    setClicks([]); setCalErr('');
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = getFirstFrameUrl();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        setFrameSize({ w: img.naturalWidth, h: img.naturalHeight });
        drawCalibration(canvas, img, [], []);
      }
    };
    img.onerror = () => setCalErr('Could not load video frame. Try re-uploading.');
  }, [step]);

  useEffect(() => {
    if (step !== 'calibrate' && step !== 'polygon') return;
    drawCalibration(canvasRef.current, imgRef.current, clicks, polygon);
  }, [clicks, polygon, step]);

  useEffect(() => {
    if (step !== 'polygon') return;
    setPolyErr('');
    const canvas = canvasRef.current;
    if (canvas && imgRef.current) {
      canvas.width = imgRef.current.naturalWidth; canvas.height = imgRef.current.naturalHeight;
      drawCalibration(canvas, imgRef.current, clicks, polygon);
    }
  }, [step]);

  const pollData = useCallback(async () => {
    try {
      const [vRes, cRes, sRes] = await Promise.allSettled([
        getViolations({ limit: 6 }),
        getCongestionStatus(),
        getVideoStats(),
      ]);
      if (vRes.status === 'fulfilled' && Array.isArray(vRes.value)) setViolations(vRes.value);
      if (cRes.status === 'fulfilled' && cRes.value) setCongestion(cRes.value);
      if (sRes.status === 'fulfilled' && sRes.value) setVideoStats(sRes.value);
      setLastRefresh(new Date());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!streaming) return;
    pollData();
    pollRef.current = setInterval(pollData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [streaming, pollData]);

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true); setUploadErr('');
    try {
      await uploadVideo(selectedFile);
      setStep('calibrate');
    } catch (err) {
      setUploadErr(err.response?.data?.detail || 'Upload failed. Please try again.');
    } finally { setUploading(false); }
  }

  function handleCanvasClick(e) {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (frameSize.w / rect.width));
    const y = Math.round((e.clientY - rect.top)  * (frameSize.h / rect.height));
    if (step === 'calibrate') {
      if (clicks.length >= 4) return;
      const nextPoint = [x, y];
      if (clicks.length === 1 && distance(clicks[0], nextPoint) < MIN_CALIBRATION_DISTANCE) {
        setCalErr('Stop line needs two different points.');
        return;
      }
      if (clicks.length === 3 && distance(clicks[2], nextPoint) < MIN_CALIBRATION_DISTANCE) {
        setCalErr('Signal ROI needs two opposite corners.');
        return;
      }
      setCalErr('');
      setClicks(prev => [...prev, [x, y]]);
    } else if (step === 'polygon') {
      setPolygon(prev => [...prev, [x, y]]);
    }
  }

  async function handleConfirmCalibration() {
    if (clicks.length < 4) return;
    setSavingCal(true); setCalErr('');
    try {
      const stop_line = [clicks[0], clicks[1]];
      const x1 = Math.min(clicks[2][0], clicks[3][0]);
      const y1 = Math.min(clicks[2][1], clicks[3][1]);
      const x2 = Math.max(clicks[2][0], clicks[3][0]);
      const y2 = Math.max(clicks[2][1], clicks[3][1]);
      await saveCalibration(stop_line, [[x1, y1], [x2, y2]], null, [frameSize.w, frameSize.h]);
      setStep('polygon');
    } catch (err) {
      setCalErr(err.response?.data?.detail || 'Failed to save calibration.');
    } finally { setSavingCal(false); }
  }

  async function handleConfirmPolygon(skip = false) {
    setSavingPoly(true); setPolyErr('');
    try {
      const stop_line = [clicks[0], clicks[1]];
      const x1 = Math.min(clicks[2][0], clicks[3][0]);
      const y1 = Math.min(clicks[2][1], clicks[3][1]);
      const x2 = Math.max(clicks[2][0], clicks[3][0]);
      const y2 = Math.max(clicks[2][1], clicks[3][1]);
      const poly = skip ? null : polygon;
      await saveCalibration(stop_line, [[x1, y1], [x2, y2]], poly, [frameSize.w, frameSize.h]);
      setStep('stream'); setImgKey(k => k + 1); setStreaming(true);
    } catch (err) {
      setPolyErr(err.response?.data?.detail || 'Failed to save polygon.');
    } finally { setSavingPoly(false); }
  }

  function handleChangeVideo() {
    setStreaming(false); setStreamError(false);
    clearInterval(pollRef.current);
    setSelectedFile(null); setClicks([]); setPolygon([]);
    setStep('upload');
  }

  const sigState  = videoStats?.signal_state ?? 'UNKNOWN';
  const sigCfg    = SIGNAL_COLOR[sigState] || SIGNAL_COLOR.UNKNOWN;
  const topRoad   = congestion?.recommendations?.[0];

  // ── Shared canvas container style ─────────────────────────────────────────
  const canvasContainer = {
    backgroundColor: '#000',
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid var(--border)',
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Header + step tracker */}
      <div className="flex items-start justify-between gap-4 flex-wrap animate-fade-up">
        <div>
          <h1 className="font-display font-black text-2xl tracking-tight" style={{ color: 'var(--text)' }}>
            Live Feed
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Upload → calibrate stop line → set monitored zone → live detections
          </p>
        </div>
        <div
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl flex-wrap"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <StepBadge n={1} label="Upload"    active={step === 'upload'}    done={step !== 'upload'} />
          <div className="w-4 h-px" style={{ backgroundColor: 'var(--border-2)' }} />
          <StepBadge n={2} label="Stop Line" active={step === 'calibrate'} done={['polygon','stream'].includes(step)} />
          <div className="w-4 h-px" style={{ backgroundColor: 'var(--border-2)' }} />
          <StepBadge n={3} label="Zone"      active={step === 'polygon'}   done={step === 'stream'} />
          <div className="w-4 h-px" style={{ backgroundColor: 'var(--border-2)' }} />
          <StepBadge n={4} label="Live"      active={step === 'stream'}    done={false} />
        </div>
      </div>

      {/* ── Step 1: Upload ── */}
      {step === 'upload' && (
        <div className="flex items-center justify-center py-12 animate-fade-up delay-50">
          <div
            className="flex flex-col items-center gap-5 w-full max-w-md p-10 rounded-2xl transition-colors"
            style={{
              backgroundColor: 'var(--surface)',
              border: '2px dashed var(--border-2)',
            }}
          >
            <div style={{ color: 'var(--text-3)' }}>
              <svg className="w-12 h-12 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg" style={{ color: 'var(--text)' }}>Upload Traffic Video</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>MP4, AVI, MOV — any format OpenCV supports</p>
            </div>
            <label className="cursor-pointer">
              <input type="file" accept="video/*" className="sr-only"
                onChange={e => { setSelectedFile(e.target.files[0]); setUploadErr(''); }} />
              <span
                className="inline-block px-4 py-2 rounded-xl text-sm transition-colors"
                style={{
                  backgroundColor: 'var(--elevated)',
                  border: '1px solid var(--border-2)',
                  color: 'var(--text)',
                }}
              >
                {selectedFile ? `▶ ${selectedFile.name}` : 'Choose file…'}
              </span>
            </label>
            {uploadErr && <p className="text-sm" style={{ color: 'var(--red)' }}>{uploadErr}</p>}
            <button onClick={handleUpload} disabled={!selectedFile || uploading}
              className="btn btn-primary w-full py-2.5 font-display font-bold">
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Uploading…
                </>
              ) : 'Upload & Continue →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Stop Line + Signal ROI ── */}
      {step === 'calibrate' && (
        <div className="flex flex-col gap-4 animate-fade-up delay-50">
          <div
            className="rounded-xl px-5 py-3 flex flex-wrap gap-4 items-center"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--red)' }} />
              <span className="text-sm" style={{ color: 'var(--text-2)' }}>
                {clicks.length < 2 ? `STOP LINE — click point ${clicks.length + 1} of 2` : '✓ Stop line set'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--orange)' }} />
              <span className="text-sm" style={{ color: 'var(--text-2)' }}>
                {clicks.length < 4
                  ? clicks.length < 2 ? 'SIGNAL ROI — set after stop line'
                  : `SIGNAL ROI — click point ${clicks.length - 1} of 2`
                  : '✓ Signal ROI set'}
              </span>
            </div>
            {clicks.length > 0 && (
              <button onClick={() => setClicks([])} className="ml-auto text-xs underline" style={{ color: 'var(--text-2)' }}>
                Redo all
              </button>
            )}
          </div>
          {calErr && <p className="text-sm" style={{ color: 'var(--red)' }}>{calErr}</p>}
          <div style={canvasContainer}>
            <canvas
              ref={canvasRef} width={frameSize.w} height={frameSize.h}
              style={{ width: '100%', height: 'auto', display: 'block', cursor: clicks.length < 4 ? 'crosshair' : 'default' }}
              onClick={handleCanvasClick}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setStep('upload')} className="btn btn-ghost px-4 py-2 text-sm">← Back</button>
            <button onClick={handleConfirmCalibration} disabled={clicks.length < 4 || savingCal}
              className="btn btn-primary px-6 py-2 text-sm font-display font-bold">
              {savingCal ? 'Saving…'
                : clicks.length < 4 ? `${4 - clicks.length} more click${4 - clicks.length > 1 ? 's' : ''}`
                : 'Next: Draw Zone →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Lane ROI Polygon ── */}
      {step === 'polygon' && (
        <div className="flex flex-col gap-4 animate-fade-up delay-50">
          <div
            className="rounded-xl px-5 py-3 flex flex-wrap gap-3 items-start"
            style={{ backgroundColor: 'var(--accent-dim)', border: '1px solid var(--accent)' }}
          >
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
              style={{ color: 'var(--accent)' }} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Draw the Monitored Zone</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                Click 3+ points around the lane. Only vehicles with base inside this zone trigger red-light violations.
                Helmet, speed, and other modules monitor all lanes.
              </p>
            </div>
          </div>

          <div
            className="rounded-xl px-5 py-2.5 flex items-center gap-4 flex-wrap"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <span className="text-sm" style={{ color: 'var(--text-2)' }}>
              {polygon.length === 0 ? 'Click on the frame to place vertices'
                : polygon.length < 3 ? `${polygon.length} pt${polygon.length > 1 ? 's' : ''} — need ${3 - polygon.length} more`
                : `${polygon.length} points — polygon ready`}
            </span>
            {polygon.length > 0 && (
              <button onClick={() => setPolygon([])} className="ml-auto text-xs underline" style={{ color: 'var(--text-2)' }}>
                Clear polygon
              </button>
            )}
          </div>

          {polyErr && <p className="text-sm" style={{ color: 'var(--red)' }}>{polyErr}</p>}

          <div style={canvasContainer}>
            <canvas
              ref={canvasRef} width={frameSize.w} height={frameSize.h}
              style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
              onClick={handleCanvasClick}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setStep('calibrate')} className="btn btn-ghost px-4 py-2 text-sm">← Redo Stop Line</button>
            <button onClick={() => handleConfirmPolygon(true)} disabled={savingPoly}
              className="btn btn-ghost px-4 py-2 text-sm">Skip (no filter)</button>
            <button onClick={() => handleConfirmPolygon(false)} disabled={polygon.length < 3 || savingPoly}
              className="btn btn-primary px-6 py-2 text-sm font-display font-bold">
              {savingPoly ? 'Saving…' : 'Confirm Zone & Start →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Live Stream ── */}
      {step === 'stream' && (
        <>
          <div className="flex flex-col lg:flex-row gap-4 animate-fade-up delay-50">

            {/* Video panel */}
            <div className="flex-1 min-w-0 rounded-2xl overflow-hidden flex flex-col"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="relative bg-black flex items-center justify-center min-h-[360px]">
                {streaming ? (
                  <>
                    <img key={imgKey} src={STREAM_URL} alt="Live stream"
                      className={`w-full h-auto max-h-[560px] object-contain ${streamError ? 'hidden' : 'block'}`}
                      onLoad={() => setStreamError(false)}
                      onError={() => setStreamError(true)} />
                    {streamError && <StreamOffline />}
                  </>
                ) : <StreamOffline />}

                {streaming && !streamError && sigState !== 'UNKNOWN' && (
                  <div
                    className="absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-bold shadow-lg"
                    style={{ backgroundColor: sigCfg.bg, color: sigCfg.color }}
                  >
                    {sigState}
                  </div>
                )}
              </div>

              {/* Legend */}
              <div
                className="px-4 py-2 flex gap-4 flex-wrap text-xs border-t"
                style={{ backgroundColor: 'var(--elevated)', borderColor: 'var(--border)' }}
              >
                {[
                  { color: 'var(--red)',    label: 'RED LIGHT' },
                  { color: '#60a5fa',       label: 'HELMET'    },
                  { color: 'var(--yellow)', label: 'SPEED'     },
                  { color: 'var(--accent)', label: 'ZONE'      },
                ].map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1.5" style={{ color: 'var(--text-2)' }}>
                    <span className="w-3 h-1.5 rounded inline-block" style={{ backgroundColor: color }} />
                    {label}
                  </span>
                ))}
                <span className="ml-auto text-xs italic" style={{ color: 'var(--text-3)' }}>
                  {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Connecting…'}
                </span>
              </div>

              {/* Controls */}
              <div
                className="flex items-center gap-2 px-4 py-3 border-t flex-wrap"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                {streaming && !streamError ? (
                  <button onClick={() => { setStreaming(false); setStreamError(false); }} className="btn btn-ghost px-4 py-1.5 text-xs">Stop</button>
                ) : (
                  <button onClick={() => { setImgKey(k => k + 1); setStreamError(false); setStreaming(true); }}
                    className="btn btn-primary px-4 py-1.5 text-xs">Start Stream</button>
                )}
                <button onClick={handleChangeVideo} className="btn btn-ghost px-4 py-1.5 text-xs">Change Video</button>
                <button onClick={() => { setPolygon([]); setStep('calibrate'); }} className="btn btn-ghost px-4 py-1.5 text-xs">Re-calibrate</button>
              </div>
            </div>

            {/* Sidebar stats */}
            <div className="lg:w-60 xl:w-64 flex flex-col gap-3">
              <div className="card p-4 flex flex-col gap-3">
                <h2 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>
                  Real-Time Stats
                </h2>
                <StatTile label="Signal State" value={sigState} sub="from ROI"
                  accentColor={sigState === 'RED' ? 'var(--red)' : sigState === 'GREEN' ? 'var(--green)' : sigState === 'YELLOW' ? 'var(--yellow)' : undefined} />
                <StatTile label="FPS"           value={videoStats?.fps         ?? '—'} sub="backend processor" />
                <StatTile label="Active Tracks" value={videoStats?.track_count ?? '—'} sub="vehicles in frame" />
                <StatTile label="Top Congestion"
                  value={topRoad?.road_id ? topRoad.road_id.replace(/_/g, ' ') : '—'}
                  sub={topRoad ? `CI ${topRoad.density_index}` : '—'} />
                <StatTile label="Violations" value={violations.length || '—'} sub="latest 6 shown" />
              </div>
            </div>
          </div>

          {/* Recent detections */}
          <div className="flex flex-col gap-3 animate-fade-up delay-100">
            <h2 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>
              Recent Detections
            </h2>
            {violations.length === 0 ? (
              <div className="card flex items-center justify-center h-24 text-sm italic" style={{ color: 'var(--text-3)' }}>
                No violations detected yet
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {violations.map(v => <ViolationCard key={v.id} violation={v} />)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
