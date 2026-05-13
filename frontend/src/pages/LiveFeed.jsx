import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCongestionStatus,
  getFirstFrameUrl,
  getVideoStats,
  getViolations,
  saveCalibration,
  uploadVideo,
} from '../services/api';
import ViolationCard from '../components/ViolationCard';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const STREAM_URL = `${BACKEND_URL}/video/stream`;
const MIN_CALIBRATION_DISTANCE = 10;

const SIGNAL_COLOR = {
  RED: { bg: 'var(--red-dim)', color: 'var(--red)' },
  GREEN: { bg: 'var(--green-dim)', color: 'var(--green)' },
  YELLOW: { bg: 'var(--yellow-dim)', color: 'var(--yellow)' },
  UNKNOWN: { bg: 'var(--elevated)', color: 'var(--text-2)' },
};

function distance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function StepBadge({ n, label, active, done }) {
  return (
    <div className={`flow-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
      <span>{done ? 'OK' : n}</span>
      <strong>{label}</strong>
    </div>
  );
}

function StatTile({ label, value, sub, tone }) {
  return (
    <article className="live-stat-tile">
      <span>{label}</span>
      <strong style={{ color: tone || 'var(--text)' }}>{value}</strong>
      <small>{sub}</small>
    </article>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ModulePill({ label, active }) {
  return <span className={`module-pill ${active ? 'active' : ''}`}>{label}</span>;
}

function StreamOffline() {
  return (
    <div className="stream-offline">
      <svg width="54" height="54" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.8 10.5l4.7-4.7a.8.8 0 011.3.5v11.4a.8.8 0 01-1.3.5l-4.7-4.7M4.5 18.8h9A2.3 2.3 0 0015.8 16.5v-9A2.3 2.3 0 0013.5 5.3h-9A2.3 2.3 0 002.3 7.5v9a2.3 2.3 0 002.2 2.3z" />
      </svg>
      <strong>Stream offline</strong>
      <span>Start the processor after upload and calibration.</span>
    </div>
  );
}

function drawCalibration(canvas, img, clicks, polygon) {
  if (!canvas || !img) return;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const dot = (x, y, color, r = 7) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  if (clicks.length >= 1) dot(clicks[0][0], clicks[0][1], '#f87171');
  if (clicks.length >= 2) {
    dot(clicks[1][0], clicks[1][1], '#f87171');
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(clicks[0][0], clicks[0][1]);
    ctx.lineTo(clicks[1][0], clicks[1][1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 14px monospace';
    const mx = (clicks[0][0] + clicks[1][0]) / 2;
    const my = (clicks[0][1] + clicks[1][1]) / 2 - 14;
    ctx.fillText('STOP LINE', mx - 34, my);
  }

  if (clicks.length >= 3) dot(clicks[2][0], clicks[2][1], '#fb923c');
  if (clicks.length >= 4) {
    dot(clicks[3][0], clicks[3][1], '#fb923c');
    const x1 = Math.min(clicks[2][0], clicks[3][0]);
    const y1 = Math.min(clicks[2][1], clicks[3][1]);
    const w = Math.abs(clicks[3][0] - clicks[2][0]);
    const h = Math.abs(clicks[3][1] - clicks[2][1]);
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, w, h);
    ctx.fillStyle = 'rgba(251,146,60,0.12)';
    ctx.fillRect(x1, y1, w, h);
    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('SIGNAL ROI', x1, y1 - 8);
  }

  if (polygon && polygon.length >= 2) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i += 1) ctx.lineTo(polygon[i][0], polygon[i][1]);
    if (polygon.length >= 3) ctx.closePath();
    ctx.stroke();
    if (polygon.length >= 3) {
      ctx.fillStyle = 'rgba(56,189,248,0.12)';
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('MONITORED ZONE', polygon[0][0] + 4, polygon[0][1] - 8);
    }
    polygon.forEach((point) => dot(point[0], point[1], '#38bdf8', 5));
  }
}

export default function LiveFeed() {
  const [step, setStep] = useState('upload');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [clicks, setClicks] = useState([]);
  const [frameSize, setFrameSize] = useState({ w: 640, h: 360 });
  const [savingCal, setSavingCal] = useState(false);
  const [calErr, setCalErr] = useState('');
  const [polygon, setPolygon] = useState([]);
  const [savingPoly, setSavingPoly] = useState(false);
  const [polyErr, setPolyErr] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [imgKey, setImgKey] = useState(0);
  const [violations, setViolations] = useState([]);
  const [congestion, setCongestion] = useState(null);
  const [videoStats, setVideoStats] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showDetections, setShowDetections] = useState(true);
  const [showSettings, setShowSettings] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [fitMode, setFitMode] = useState('contain');
  const [pollMs, setPollMs] = useState(2000);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const pollRef = useRef(null);

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
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
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
    } catch {
      // Keep the stream usable when one telemetry endpoint misses a beat.
    }
  }, []);

  useEffect(() => {
    if (!streaming || !autoRefresh) return undefined;
    pollData();
    pollRef.current = setInterval(pollData, pollMs);
    return () => clearInterval(pollRef.current);
  }, [autoRefresh, pollData, pollMs, streaming]);

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

  function handleCanvasClick(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((event.clientX - rect.left) * (frameSize.w / rect.width));
    const y = Math.round((event.clientY - rect.top) * (frameSize.h / rect.height));
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
      setClicks((prev) => [...prev, [x, y]]);
    } else if (step === 'polygon') {
      setPolygon((prev) => [...prev, [x, y]]);
    }
  }

  async function handleConfirmCalibration() {
    if (clicks.length < 4) return;
    setSavingCal(true);
    setCalErr('');
    try {
      const stopLine = [clicks[0], clicks[1]];
      const x1 = Math.min(clicks[2][0], clicks[3][0]);
      const y1 = Math.min(clicks[2][1], clicks[3][1]);
      const x2 = Math.max(clicks[2][0], clicks[3][0]);
      const y2 = Math.max(clicks[2][1], clicks[3][1]);
      await saveCalibration(stopLine, [[x1, y1], [x2, y2]], null, [frameSize.w, frameSize.h]);
      setStep('polygon');
    } catch (err) {
      setCalErr(err.response?.data?.detail || 'Failed to save calibration.');
    } finally {
      setSavingCal(false);
    }
  }

  async function handleConfirmPolygon(skip = false) {
    setSavingPoly(true);
    setPolyErr('');
    try {
      const stopLine = [clicks[0], clicks[1]];
      const x1 = Math.min(clicks[2][0], clicks[3][0]);
      const y1 = Math.min(clicks[2][1], clicks[3][1]);
      const x2 = Math.max(clicks[2][0], clicks[3][0]);
      const y2 = Math.max(clicks[2][1], clicks[3][1]);
      await saveCalibration(stopLine, [[x1, y1], [x2, y2]], skip ? null : polygon, [frameSize.w, frameSize.h]);
      setStep('stream');
      setImgKey((key) => key + 1);
      setStreaming(true);
    } catch (err) {
      setPolyErr(err.response?.data?.detail || 'Failed to save polygon.');
    } finally {
      setSavingPoly(false);
    }
  }

  function handleChangeVideo() {
    setStreaming(false);
    setStreamError(false);
    clearInterval(pollRef.current);
    setSelectedFile(null);
    setClicks([]);
    setPolygon([]);
    setStep('upload');
  }

  const sigState = videoStats?.signal_state ?? 'UNKNOWN';
  const sigCfg = SIGNAL_COLOR[sigState] || SIGNAL_COLOR.UNKNOWN;
  const topRoad = congestion?.recommendations?.[0];
  const modules = videoStats?.modules || {};
  const fileSize = selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB` : 'No file';

  const stepHelp = useMemo(() => ({
    upload: 'Choose a traffic video and upload it to the backend processor.',
    calibrate: 'Click two stop-line points, then two opposite corners around the signal light.',
    polygon: 'Click 3 or more points around the monitored lane area, or skip this filter.',
    stream: 'Watch the MJPEG stream and tune display or refresh settings live.',
  })[step], [step]);

  return (
    <div className="live-page dashboard-page">
      <header className="dashboard-hero live-hero">
        <div>
          <span className="eyebrow">Live operations</span>
          <h1>Video upload, calibration, and real-time detection</h1>
          <p>{stepHelp}</p>
        </div>
        <div className="hero-status-card">
          <span className="live-pill"><i style={{ backgroundColor: streaming ? 'var(--green)' : 'var(--yellow)' }} /> {streaming ? 'Streaming' : 'Setup'}</span>
          <strong>{sigState}</strong>
          <small>{lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : fileSize}</small>
        </div>
      </header>

      <section className="live-flow panel">
        <StepBadge n={1} label="Upload" active={step === 'upload'} done={step !== 'upload'} />
        <StepBadge n={2} label="Stop Line" active={step === 'calibrate'} done={['polygon', 'stream'].includes(step)} />
        <StepBadge n={3} label="Zone" active={step === 'polygon'} done={step === 'stream'} />
        <StepBadge n={4} label="Live Feed" active={step === 'stream'} done={false} />
      </section>

      {step === 'upload' && (
        <section className="live-setup-grid">
          <div className="panel upload-panel">
            <div className="section-title">
              <div>
                <span>Source video</span>
                <h2>Upload traffic footage</h2>
              </div>
              <span className="mini-badge">OpenCV compatible</span>
            </div>
            <label className="drop-zone">
              <input type="file" accept="video/*" onChange={(event) => { setSelectedFile(event.target.files[0]); setUploadErr(''); }} />
              <svg width="54" height="54" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M4 16.5V18a2 2 0 002 2h12a2 2 0 002-2v-1.5" />
              </svg>
              <strong>{selectedFile ? selectedFile.name : 'Choose a traffic video'}</strong>
              <span>{selectedFile ? fileSize : 'MP4, AVI, MOV, and common camera exports'}</span>
            </label>
            {uploadErr && <div className="inline-alert danger"><span>{uploadErr}</span></div>}
            <button onClick={handleUpload} disabled={!selectedFile || uploading} className="btn btn-primary live-primary-action" type="button">
              {uploading ? 'Uploading...' : 'Upload and Calibrate'}
            </button>
          </div>

          <aside className="panel live-guidance">
            <div className="section-title">
              <div>
                <span>Workflow</span>
                <h2>What happens next</h2>
              </div>
            </div>
            <div className="guide-list">
              <span><b>1</b> Extract first frame for calibration</span>
              <span><b>2</b> Save stop line and signal ROI</span>
              <span><b>3</b> Optional monitored lane polygon</span>
              <span><b>4</b> Start live stream with violation polling</span>
            </div>
          </aside>
        </section>
      )}

      {(step === 'calibrate' || step === 'polygon') && (
        <section className="panel calibration-panel">
          <div className="section-title">
            <div>
              <span>{step === 'calibrate' ? 'Calibration' : 'Monitored zone'}</span>
              <h2>{step === 'calibrate' ? 'Mark stop line and signal ROI' : 'Draw lane polygon'}</h2>
            </div>
            <span className="mini-badge">{frameSize.w} x {frameSize.h}</span>
          </div>

          <div className="calibration-status">
            {step === 'calibrate' ? (
              <>
                <span><i style={{ backgroundColor: 'var(--red)' }} />{clicks.length < 2 ? `Stop line point ${clicks.length + 1} of 2` : 'Stop line ready'}</span>
                <span><i style={{ backgroundColor: 'var(--orange)' }} />{clicks.length < 4 ? clicks.length < 2 ? 'Signal ROI waits for stop line' : `Signal ROI point ${clicks.length - 1} of 2` : 'Signal ROI ready'}</span>
                {clicks.length > 0 && <button onClick={() => setClicks([])} type="button">Redo all</button>}
              </>
            ) : (
              <>
                <span><i style={{ backgroundColor: 'var(--accent)' }} />{polygon.length < 3 ? `${polygon.length} point${polygon.length === 1 ? '' : 's'} placed` : `${polygon.length} points ready`}</span>
                {polygon.length > 0 && <button onClick={() => setPolygon([])} type="button">Clear polygon</button>}
              </>
            )}
          </div>

          {(calErr || polyErr) && <div className="inline-alert danger"><span>{calErr || polyErr}</span></div>}

          <div className="calibration-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={frameSize.w}
              height={frameSize.h}
              onClick={handleCanvasClick}
            />
          </div>

          <div className="calibration-actions">
            {step === 'calibrate' ? (
              <>
                <button onClick={() => setStep('upload')} className="btn btn-ghost" type="button">Back</button>
                <button onClick={handleConfirmCalibration} disabled={clicks.length < 4 || savingCal} className="btn btn-primary" type="button">
                  {savingCal ? 'Saving...' : clicks.length < 4 ? `${4 - clicks.length} clicks remaining` : 'Next: Draw Zone'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setStep('calibrate')} className="btn btn-ghost" type="button">Redo Stop Line</button>
                <button onClick={() => handleConfirmPolygon(true)} disabled={savingPoly} className="btn btn-ghost" type="button">Skip Zone</button>
                <button onClick={() => handleConfirmPolygon(false)} disabled={polygon.length < 3 || savingPoly} className="btn btn-primary" type="button">
                  {savingPoly ? 'Saving...' : 'Confirm Zone and Start'}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {step === 'stream' && (
        <>
          <section className="live-console-grid">
            <div className="panel stream-panel">
              <div className="stream-stage">
                {streaming ? (
                  <>
                    <img
                      key={imgKey}
                      src={STREAM_URL}
                      alt="Live stream"
                      className={`${streamError ? 'hidden' : ''} ${highContrast ? 'high-contrast' : ''}`}
                      style={{ objectFit: fitMode }}
                      onLoad={() => setStreamError(false)}
                      onError={() => setStreamError(true)}
                    />
                    {streamError && <StreamOffline />}
                  </>
                ) : (
                  <StreamOffline />
                )}
                {showDetections && streaming && !streamError && (
                  <span className="signal-badge" style={{ backgroundColor: sigCfg.bg, color: sigCfg.color }}>{sigState}</span>
                )}
              </div>

              <div className="stream-toolbar">
                {streaming && !streamError ? (
                  <button onClick={() => { setStreaming(false); setStreamError(false); }} className="btn btn-ghost" type="button">Stop</button>
                ) : (
                  <button onClick={() => { setImgKey((key) => key + 1); setStreamError(false); setStreaming(true); }} className="btn btn-primary" type="button">Start Stream</button>
                )}
                <button onClick={pollData} className="btn btn-ghost" type="button">Refresh Stats</button>
                <button onClick={() => { setPolygon([]); setStep('calibrate'); }} className="btn btn-ghost" type="button">Recalibrate</button>
                <button onClick={handleChangeVideo} className="btn btn-ghost" type="button">Change Video</button>
              </div>
            </div>

            <aside className="live-side-stack">
              <div className="panel live-stats-panel">
                <div className="section-title">
                  <div>
                    <span>Telemetry</span>
                    <h2>Live stats</h2>
                  </div>
                </div>
                <div className="live-stat-grid">
                  <StatTile label="Signal" value={sigState} sub="Signal ROI" tone={sigCfg.color} />
                  <StatTile label="FPS" value={videoStats?.fps ?? '--'} sub="Backend processor" />
                  <StatTile label="Tracks" value={videoStats?.track_count ?? '--'} sub="Vehicles in frame" />
                  <StatTile label="Top road" value={topRoad?.road_id ? topRoad.road_id.replace(/_/g, ' ') : '--'} sub={topRoad ? `CI ${topRoad.density_index}` : 'No congestion data'} />
                </div>
              </div>

              <div className="panel live-settings-panel">
                <div className="section-title">
                  <div>
                    <span>Controls</span>
                    <h2>Working options</h2>
                  </div>
                  <button className="mini-badge" onClick={() => setShowSettings((value) => !value)} type="button">{showSettings ? 'Hide' : 'Show'}</button>
                </div>
                {showSettings && (
                  <div className="settings-stack">
                    <ToggleRow label="Auto refresh" description={`${pollMs / 1000}s telemetry polling`} checked={autoRefresh} onChange={setAutoRefresh} />
                    <ToggleRow label="Signal overlay" description="Show live signal badge on video" checked={showDetections} onChange={setShowDetections} />
                    <ToggleRow label="High contrast" description="Boost the stream preview display" checked={highContrast} onChange={setHighContrast} />
                    <label className="range-row">
                      <span>Poll interval</span>
                      <input type="range" min="1000" max="5000" step="500" value={pollMs} onChange={(event) => setPollMs(Number(event.target.value))} />
                      <strong>{pollMs / 1000}s</strong>
                    </label>
                    <div className="segmented-control full">
                      <button className={fitMode === 'contain' ? 'active' : ''} onClick={() => setFitMode('contain')} type="button">Fit</button>
                      <button className={fitMode === 'cover' ? 'active' : ''} onClick={() => setFitMode('cover')} type="button">Fill</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="panel modules-panel">
                <div className="section-title">
                  <div>
                    <span>Modules</span>
                    <h2>Detection stack</h2>
                  </div>
                </div>
                <div className="module-grid">
                  <ModulePill label="YOLO" active={modules.primary_yolo} />
                  <ModulePill label="Red" active={modules.red_light} />
                  <ModulePill label="Helmet" active={modules.helmet} />
                  <ModulePill label="Speed" active={modules.speed} />
                  <ModulePill label="ANPR" active={modules.anpr} />
                  <ModulePill label="Congestion" active={modules.congestion} />
                  <ModulePill label="Accident" active={modules.accident} />
                </div>
              </div>
            </aside>
          </section>

          <section className="panel">
            <div className="section-title">
              <div>
                <span>Detection stream</span>
                <h2>Recent violations</h2>
              </div>
              <span className="mini-badge">{lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Waiting'}</span>
            </div>
            {violations.length === 0 ? (
              <div className="empty-state"><span>No violations detected yet.</span></div>
            ) : (
              <div className="recent-card-grid">
                {violations.map((violation) => <ViolationCard key={violation.id} violation={violation} />)}
              </div>
            )}
          </section>
        </>
      )}

      <footer className="dashboard-footer">
        <span>TrafficIQ Live Feed</span>
        <span>Upload, calibrate, stream, and inspect detections</span>
        <span>Settings apply immediately to the active console</span>
      </footer>
    </div>
  );
}
