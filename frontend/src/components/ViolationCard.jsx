const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

function toImageUrl(path) {
  if (!path) return null;
  const normalised = path.replace(/\\/g, '/');
  const idx = normalised.indexOf('static/');
  const relative = idx !== -1 ? normalised.slice(idx) : normalised.replace(/^\//, '');
  return `${BACKEND_URL}/${relative}`;
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const TYPE_CONFIG = {
  RED_LIGHT: { label: 'Red Light', css: 'badge-red',    bar: 'var(--red)' },
  HELMET:    { label: 'Helmet',    css: 'badge-orange', bar: 'var(--orange)' },
  SPEED:     { label: 'Speed',     css: 'badge-yellow', bar: 'var(--yellow)' },
};

export default function ViolationCard({ violation }) {
  const { violation_type, timestamp, image_path, plate_text, plate_status, confidence_score, speed_kmh, track_id } = violation;
  const cfg      = TYPE_CONFIG[violation_type] || { label: violation_type, css: 'badge-accent', bar: 'var(--accent)' };
  const imageUrl = toImageUrl(image_path);

  return (
    <div
      className="card overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5"
      style={{ borderTopColor: cfg.bar, borderTopWidth: '2px' }}
    >
      {/* Image */}
      <div
        className="h-36 flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: 'var(--elevated)' }}
      >
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt="Vehicle"
              className="w-full h-full object-cover"
              onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
            />
            <div
              className="w-full h-full hidden items-center justify-center text-xs"
              style={{ color: 'var(--text-3)' }}
            >
              No image
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
            <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <span className="text-xs">No image</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-center justify-between">
          <span className={`badge ${cfg.css}`}>{cfg.label}</span>
          <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>#{track_id}</span>
        </div>

        {/* Plate */}
        {plate_status === 'plate_not_visible' ? (
          <span className="text-xs px-2 py-0.5 rounded-md w-fit" style={{ backgroundColor: 'var(--elevated)', color: 'var(--text-2)' }}>
            Plate not visible
          </span>
        ) : plate_text ? (
          <span className="font-mono font-semibold text-sm" style={{ color: 'var(--text)', letterSpacing: '0.06em' }}>
            {plate_text}
          </span>
        ) : (
          <span className="text-xs italic" style={{ color: 'var(--text-3)' }}>No plate data</span>
        )}

        {violation_type === 'SPEED' && speed_kmh != null && (
          <span className="font-mono font-bold text-sm" style={{ color: 'var(--yellow)' }}>
            {speed_kmh.toFixed(1)} km/h
          </span>
        )}

        <div
          className="mt-auto pt-2 flex items-center justify-between border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{formatTimestamp(timestamp)}</span>
          {confidence_score != null && (
            <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
              {(confidence_score * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
