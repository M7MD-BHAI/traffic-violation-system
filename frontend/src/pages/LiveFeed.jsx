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
  RED:     'bg-red-600 text-white',
  GREEN:   'bg-emerald-500 text-white',
  YELLOW:  'bg-yellow-400 text-black',
  UNKNOWN: 'bg-slate-600 text-slate-300',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function StepBadge({ n, label, active, done }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
        ${done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
        {done ? '✓' : n}
      </div>
      <span className={`text-sm ${active ? 'text-white font-medium' : done ? 'text-emerald-400' : 'text-slate-500'}`}>
        {label}
      </span>
    </div>
  );
}

function StatTile({ label, value, sub, accent }) {
  return (
    <div className="bg-slate-700/60 rounded-xl px-4 py-3 flex flex-col gap-0.5">
      <span className="text-slate-400 text-xs uppercase tracking-wide">{label}</span>
      <span className={`font-bold text-xl leading-tight ${accent || 'text-white'}`}>{value}</span>
      {sub && <span className="text-slate-400 text-xs">{sub}</span>}
    </div>
  );
}

function StreamOffline() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-slate-500 h-full min-h-[360px]">
      <svg className="w-16 h-16 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
      </svg>
      <p className="text-sm font-medium">Stream offline</p>
    </div>
  );
}

function drawCalibration(canvas, img, clicks) {
  if (!canvas || !img) return;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const dot = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  if (clicks.length >= 1) dot(clicks[0][0], clicks[0][1], '#ef4444');
  if (clicks.length >= 2) {
    dot(clicks[1][0], clicks[1][1], '#ef4444');
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(clicks[0][0], clicks[0][1]);
    ctx.lineTo(clicks[1][0], clicks[1][1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 14px monospace';
    const mx = (clicks[0][0] + clicks[1][0]) / 2;
    const my = (clicks[0][1] + clicks[1][1]) / 2 - 14;
    ctx.fillText('STOP LINE', mx - 34, my);
  }

  if (clicks.length >= 3) dot(clicks[2][0], clicks[2][1], '#f97316');
  if (clicks.length >= 4) {
    dot(clicks[3][0], clicks[3][1], '#f97316');
    const x1 = Math.min(clicks[2][0], clicks[3][0]);
    const y1 = Math.min(clicks[2][1], clicks[3][1]);
    const w  = Math.abs(clicks[3][0] - clicks[2][0]);
    const h  = Math.abs(clicks[3][1] - clicks[2][1]);
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, w, h);
    ctx.fillStyle = 'rgba(249,115,22,0.12)';
    ctx.fillRect(x1, y1, w, h);
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('SIGNAL ROI', x1, y1 - 8);
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LiveFeed() {
  const [step, setStep] = useState('upload'); // 'upload' | 'calibrate' | 'stream'

  // Step 1
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadErr, setUploadErr]       = useState('');

  // Step 2
  const [clicks, setClicks]       = useState([]);
  const [frameSize, setFrameSize] = useState({ w: 640, h: 360 });
  const [savingCal, setSavingCal] = useState(false);
  const [calErr, setCalErr]       = useState('');
  const canvasRef = useRef(null);
  const imgRef    = useRef(null);

  // Step 3
  const [streaming, setStreaming]     = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [imgKey, setImgKey]           = useState(0);
  const [violations, setViolations]   = useState([]);
  const [congestion, setCongestion]   = useState(null);
  const [videoStats, setVideoStats]   = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const pollRef = useRef(null);

  // Load first frame on entering calibrate step
  useEffect(() => {
    if (step !== 'calibrate') return;
    setClicks([]);
    setCalErr('');
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = getFirstFrameUrl();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        setFrameSize({ w: img.naturalWidth, h: img.naturalHeight });
        drawCalibration(canvas, img, []);
      }
    };
    img.onerror = () => setCalErr('Could not load video frame. Try re-uploading.');
  }, [step]);

  useEffect(() => {
    if (step !== 'calibrate') return;
    drawCalibration(canvasRef.current, imgRef.current, clicks);
  }, [clicks, step]);

  // Polling in stream step
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

  // Handlers
  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadErr('');
    try {
      await uploadVideo(selectedFile);
      setStep('calibrate');
    } catch (err) {
      setUploadErr(err.response?.data?.detail || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function handleCanvasClick(e) {
    if (clicks.length >= 4) return;
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (frameSize.w / rect.width));
    const y = Math.round((e.clientY - rect.top)  * (frameSize.h / rect.height));
    setClicks(prev => [...prev, [x, y]]);
  }

  async function handleConfirmCalibration() {
    if (clicks.length < 4) return;
    setSavingCal(true);
    setCalErr('');
    try {
      const stop_line  = [clicks[0], clicks[1]];
      const x1 = Math.min(clicks[2][0], clicks[3][0]);
      const y1 = Math.min(clicks[2][1], clicks[3][1]);
      const x2 = Math.max(clicks[2][0], clicks[3][0]);
      const y2 = Math.max(clicks[2][1], clicks[3][1]);
      await saveCalibration(stop_line, [[x1, y1], [x2, y2]]);
      setStep('stream');
      setImgKey(k => k + 1);
      setStreaming(true);
    } catch (err) {
      setCalErr(err.response?.data?.detail || 'Failed to save calibration.');
    } finally {
      setSavingCal(false);
    }
  }

  function handleChangeVideo() {
    setStreaming(false);
    setStreamError(false);
    clearInterval(pollRef.current);
    setSelectedFile(null);
    setStep('upload');
  }

  const sigState  = videoStats?.signal_state ?? 'UNKNOWN';
  const sigAccent = { RED: 'text-red-400', GREEN: 'text-emerald-400', YELLOW: 'text-yellow-400' }[sigState] ?? 'text-slate-400';
  const topRoad   = congestion?.recommendations?.[0];

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-6 md:px-8 flex flex-col gap-6">

      {/* Header + step indicator */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-white text-2xl font-bold">Live Feed</h1>
          <p className="text-slate-400 text-sm mt-0.5">Upload video → draw stop line → watch live detections</p>
        </div>
        <div className="flex items-center gap-4 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5">
          <StepBadge n={1} label="Upload"    active={step === 'upload'}    done={step !== 'upload'} />
          <div className="w-5 h-px bg-slate-600" />
          <StepBadge n={2} label="Draw Line" active={step === 'calibrate'} done={step === 'stream'} />
          <div className="w-5 h-px bg-slate-600" />
          <StepBadge n={3} label="Live Feed" active={step === 'stream'}    done={false} />
        </div>
      </div>

      {/* ── Step 1: Upload ─────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="flex items-center justify-center py-12">
          <div className="bg-slate-800 border-2 border-dashed border-slate-600 hover:border-slate-500
                          rounded-2xl p-10 flex flex-col items-center gap-5 w-full max-w-md transition-colors">
            <svg className="w-12 h-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <div className="text-center">
              <p className="text-white font-semibold text-lg">Upload Traffic Video</p>
              <p className="text-slate-400 text-sm mt-1">MP4, AVI, MOV — any format OpenCV supports</p>
            </div>

            <label className="cursor-pointer">
              <input type="file" accept="video/*" className="sr-only"
                onChange={e => { setSelectedFile(e.target.files[0]); setUploadErr(''); }} />
              <span className="inline-block px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white
                               text-sm rounded-lg border border-slate-500 transition-colors">
                {selectedFile ? `📹 ${selectedFile.name}` : 'Choose file…'}
              </span>
            </label>

            {uploadErr && <p className="text-red-400 text-sm text-center">{uploadErr}</p>}

            <button onClick={handleUpload} disabled={!selectedFile || uploading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                         text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors
                         flex items-center justify-center gap-2">
              {uploading ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>Uploading…</>
              ) : 'Upload & Continue →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Calibrate ──────────────────────────────────────────────── */}
      {step === 'calibrate' && (
        <div className="flex flex-col gap-4">

          {/* Instruction bar */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-3 flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500"/>
              <span className="text-sm text-slate-300">
                {clicks.length < 2
                  ? `STOP LINE — click point ${clicks.length + 1} of 2 on the line cars must not cross`
                  : '✓ Stop line set'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500"/>
              <span className="text-sm text-slate-300">
                {clicks.length < 4
                  ? clicks.length < 2
                    ? 'SIGNAL ROI — set after stop line'
                    : `SIGNAL ROI — click point ${clicks.length - 1} of 2 around the traffic light`
                  : '✓ Signal ROI set'}
              </span>
            </div>
            {clicks.length > 0 && (
              <button onClick={() => setClicks([])}
                className="ml-auto text-xs text-slate-400 hover:text-white underline">
                Redo all
              </button>
            )}
          </div>

          {calErr && <p className="text-red-400 text-sm">{calErr}</p>}

          {/* Canvas */}
          <div className="bg-black rounded-2xl overflow-hidden border border-slate-700 select-none">
            <canvas
              ref={canvasRef}
              width={frameSize.w}
              height={frameSize.h}
              style={{ width: '100%', height: 'auto', display: 'block',
                       cursor: clicks.length < 4 ? 'crosshair' : 'default' }}
              onClick={handleCanvasClick}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button onClick={() => setStep('upload')}
              className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
              ← Back
            </button>
            <button onClick={handleConfirmCalibration}
              disabled={clicks.length < 4 || savingCal}
              className="px-6 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40
                         disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors">
              {savingCal ? 'Saving…'
                : clicks.length < 4 ? `${4 - clicks.length} more click${4 - clicks.length > 1 ? 's' : ''} needed`
                : 'Confirm & Start Processing →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Stream ─────────────────────────────────────────────────── */}
      {step === 'stream' && (
        <>
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Video panel */}
            <div className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden flex flex-col">
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

                {/* Signal badge */}
                {streaming && !streamError && sigState !== 'UNKNOWN' && (
                  <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-bold shadow-lg ${SIGNAL_COLOR[sigState]}`}>
                    {sigState}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-700 bg-slate-800/80 flex-wrap">
                <div className="flex gap-2">
                  {streaming && !streamError ? (
                    <button onClick={() => { setStreaming(false); setStreamError(false); }}
                      className="px-4 py-1.5 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors">
                      Stop
                    </button>
                  ) : (
                    <button onClick={() => { setImgKey(k => k + 1); setStreamError(false); setStreaming(true); }}
                      className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors">
                      Start Stream
                    </button>
                  )}
                  <button onClick={handleChangeVideo}
                    className="px-4 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors">
                    Change Video
                  </button>
                  <button onClick={() => setStep('calibrate')}
                    className="px-4 py-1.5 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors">
                    Re-draw Line
                  </button>
                </div>
                <span className="text-xs text-slate-500">
                  {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Connecting…'}
                </span>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:w-64 xl:w-72 flex flex-col gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3">
                <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wide">Real-Time Stats</h2>
                <StatTile label="Signal State" value={sigState} sub="detected from ROI" accent={sigAccent} />
                <StatTile label="FPS" value={videoStats?.fps ?? '—'} sub="backend processor" />
                <StatTile label="Active Tracks" value={videoStats?.track_count ?? '—'} sub="vehicles in frame" />
                <StatTile label="Top Congestion"
                  value={topRoad?.road_id ? topRoad.road_id.replace(/_/g, ' ') : '—'}
                  sub={topRoad ? `CI ${topRoad.density_index}` : '—'} />
                <StatTile label="Violations" value={violations.length || '—'} sub="this session" />
              </div>
            </div>
          </div>

          {/* Violations */}
          <div className="flex flex-col gap-3">
            <h2 className="text-white text-lg font-semibold">Recent Detections</h2>
            {violations.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-slate-500 text-sm italic">
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
