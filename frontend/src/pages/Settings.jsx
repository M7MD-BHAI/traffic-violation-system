import { useState } from 'react';
import { saveSettings } from '../services/api';

const DEFAULTS = {
  speed_limit_kmh:           50,
  anpr_confidence_threshold: 0.40,
  helmet_voting_threshold:   0.70,
  camera_name:               '',
  video_source:              '',
};

const SYSTEM_INFO = [
  { label: 'Primary Model',  value: 'YOLOv8n (yolov8n.pt)' },
  { label: 'Helmet Model',   value: 'helmet_detector.pt'   },
  { label: 'Plate Model',    value: 'plate_detector.pt'    },
  { label: 'Database',       value: 'PostgreSQL / SQLite'  },
];

function Toast({ message, type }) {
  if (!message) return null;
  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold shadow-2xl animate-fade-up"
      style={type === 'error'
        ? { backgroundColor: 'var(--red-dim)',   border: '1px solid var(--red)',   color: 'var(--red)'   }
        : { backgroundColor: 'var(--green-dim)', border: '1px solid var(--green)', color: 'var(--green)' }
      }
    >
      {type === 'error' ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      {message}
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <div className="card p-6 flex flex-col gap-5 animate-fade-up">
      <div>
        <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
        {description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{description}</p>}
      </div>
      <div className="flex flex-col gap-5 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
        {children}
      </div>
    </div>
  );
}

function Field({ id, label, sub, children }) {
  return (
    <div>
      <label htmlFor={id} className="block mb-2">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-2)' }}>{label}</span>
        {sub && <span className="ml-2 text-xs" style={{ color: 'var(--text-3)' }}>{sub}</span>}
      </label>
      {children}
    </div>
  );
}

export default function Settings() {
  const [form,   setForm]   = useState({ ...DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [toast,  setToast]  = useState({ message: '', type: 'success' });

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: 'success' }), 3500);
  }

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSettings(form);
      showToast('Settings saved successfully.');
    } catch {
      showToast('Failed to save — backend /settings not reachable.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Toast message={toast.message} type={toast.type} />

      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="font-display font-black text-2xl tracking-tight" style={{ color: 'var(--text)' }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
          Configure detection thresholds, camera inputs, and system info
        </p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-5 max-w-2xl">

        {/* Detection */}
        <Section title="Detection Settings" description="Tune violation detection sensitivity and speed enforcement" className="delay-50">

          <Field id="speed_limit" label="Speed Limit" sub="km/h">
            <input
              id="speed_limit" type="number" min={10} max={200} step={5}
              value={form.speed_limit_kmh}
              onChange={e => setField('speed_limit_kmh', Number(e.target.value))}
              className="input-field"
              style={{ maxWidth: '180px' }}
            />
          </Field>

          <Field id="anpr_conf" label="ANPR Confidence Threshold" sub={`current: ${form.anpr_confidence_threshold.toFixed(2)}`}>
            <input
              id="anpr_conf" type="range" min={0.10} max={1.00} step={0.01}
              value={form.anpr_confidence_threshold}
              onChange={e => setField('anpr_confidence_threshold', parseFloat(e.target.value))}
              className="w-full max-w-sm"
              style={{ accentColor: 'var(--accent)' }}
            />
            <div className="flex justify-between max-w-sm text-xs mt-1" style={{ color: 'var(--text-3)' }}>
              <span>0.10 — lenient</span>
              <span>1.00 — strict</span>
            </div>
          </Field>

          <Field id="helmet_vote" label="Helmet Voting Threshold" sub={`current: ${form.helmet_voting_threshold.toFixed(2)}`}>
            <input
              id="helmet_vote" type="range" min={0.50} max={1.00} step={0.01}
              value={form.helmet_voting_threshold}
              onChange={e => setField('helmet_voting_threshold', parseFloat(e.target.value))}
              className="w-full max-w-sm"
              style={{ accentColor: 'var(--accent)' }}
            />
            <div className="flex justify-between max-w-sm text-xs mt-1" style={{ color: 'var(--text-3)' }}>
              <span>0.50 — sensitive</span>
              <span>1.00 — strict</span>
            </div>
          </Field>

        </Section>

        {/* Camera */}
        <Section title="Camera Settings" description="Identify the camera and set the video source for detection" className="delay-100">

          <Field id="camera_name" label="Camera Name / Road ID">
            <input
              id="camera_name" type="text" placeholder="e.g. North_Street"
              value={form.camera_name}
              onChange={e => setField('camera_name', e.target.value)}
              className="input-field"
            />
          </Field>

          <Field id="video_source" label="Video Source Path" sub="file path or RTSP URL">
            <input
              id="video_source" type="text" placeholder="e.g. data/test_videos/test.mp4"
              value={form.video_source}
              onChange={e => setField('video_source', e.target.value)}
              className="input-field font-mono text-xs"
            />
          </Field>

        </Section>

        {/* System info */}
        <Section title="System Info" description="Read-only — reflects configuration from environment variables" className="delay-150">
          <dl className="flex flex-col gap-0">
            {SYSTEM_INFO.map(({ label, value }) => (
              <div
                key={label}
                className="flex justify-between py-2.5"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <dt className="text-sm" style={{ color: 'var(--text-2)' }}>{label}</dt>
                <dd className="text-sm font-mono font-semibold" style={{ color: 'var(--text)' }}>{value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* Save */}
        <div className="flex justify-end animate-fade-up delay-200">
          <button
            type="submit" disabled={saving}
            className="btn btn-primary px-7 py-2.5 font-display font-bold tracking-wide"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Saving…
              </>
            ) : 'Save Settings'}
          </button>
        </div>

      </form>
    </div>
  );
}
