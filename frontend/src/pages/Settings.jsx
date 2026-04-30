import { useState } from 'react';
import { saveSettings } from '../services/api';

// ── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULTS = {
  speed_limit_kmh: 50,
  anpr_confidence_threshold: 0.40,
  helmet_voting_threshold: 0.70,
  camera_name: '',
  video_source: '',
};

const SYSTEM_INFO = [
  { label: 'Primary Model',  value: 'YOLOv8n (yolov8n.pt)' },
  { label: 'Helmet Model',   value: 'helmet_detector.pt' },
  { label: 'Plate Model',    value: 'plate_detector.pt' },
  { label: 'Database',       value: 'PostgreSQL / SQLite' },
];

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionHeading({ title, description }) {
  return (
    <div className="mb-4">
      <h2 className="text-white text-base font-semibold">{title}</h2>
      {description && (
        <p className="text-slate-400 text-xs mt-0.5">{description}</p>
      )}
    </div>
  );
}

function FieldLabel({ htmlFor, label, sub }) {
  return (
    <label htmlFor={htmlFor} className="block mb-1">
      <span className="text-slate-200 text-sm font-medium">{label}</span>
      {sub && <span className="ml-2 text-slate-500 text-xs">{sub}</span>}
    </label>
  );
}

function Toast({ message, type }) {
  if (!message) return null;
  const colours =
    type === 'error'
      ? 'bg-red-900/80 border-red-700 text-red-300'
      : 'bg-emerald-900/80 border-emerald-700 text-emerald-300';
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl ${colours}`}
    >
      <span>{type === 'error' ? '✕' : '✓'}</span>
      {message}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Settings() {
  const [form, setForm] = useState({ ...DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: 'success' }), 3500);
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

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
    <div className="min-h-screen bg-slate-900 px-4 py-6 md:px-8">
      <Toast message={toast.message} type={toast.type} />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-white text-2xl font-bold">Settings</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Configure detection thresholds, camera inputs, and view system info
        </p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-2xl">

        {/* ── Detection Settings ──────────────────────────────────────────── */}
        <section className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
          <SectionHeading
            title="Detection Settings"
            description="Tune violation detection sensitivity and speed enforcement"
          />

          {/* Speed Limit */}
          <div className="mb-5">
            <FieldLabel
              htmlFor="speed_limit"
              label="Speed Limit"
              sub="km/h"
            />
            <input
              id="speed_limit"
              type="number"
              min={10}
              max={200}
              step={5}
              value={form.speed_limit_kmh}
              onChange={(e) => setField('speed_limit_kmh', Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* ANPR Confidence */}
          <div className="mb-5">
            <FieldLabel
              htmlFor="anpr_conf"
              label="ANPR Confidence Threshold"
              sub={`current: ${form.anpr_confidence_threshold.toFixed(2)}`}
            />
            <input
              id="anpr_conf"
              type="range"
              min={0.10}
              max={1.00}
              step={0.01}
              value={form.anpr_confidence_threshold}
              onChange={(e) =>
                setField('anpr_confidence_threshold', parseFloat(e.target.value))
              }
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-slate-500 text-xs mt-1">
              <span>0.10 (lenient)</span>
              <span>1.00 (strict)</span>
            </div>
          </div>

          {/* Helmet Voting */}
          <div>
            <FieldLabel
              htmlFor="helmet_vote"
              label="Helmet Voting Threshold"
              sub={`current: ${form.helmet_voting_threshold.toFixed(2)}`}
            />
            <input
              id="helmet_vote"
              type="range"
              min={0.50}
              max={1.00}
              step={0.01}
              value={form.helmet_voting_threshold}
              onChange={(e) =>
                setField('helmet_voting_threshold', parseFloat(e.target.value))
              }
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-slate-500 text-xs mt-1">
              <span>0.50 (sensitive)</span>
              <span>1.00 (strict)</span>
            </div>
          </div>
        </section>

        {/* ── Camera Settings ─────────────────────────────────────────────── */}
        <section className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
          <SectionHeading
            title="Camera Settings"
            description="Identify the camera and set the video source for detection"
          />

          {/* Camera name / road ID */}
          <div className="mb-5">
            <FieldLabel htmlFor="camera_name" label="Camera Name / Road ID" />
            <input
              id="camera_name"
              type="text"
              placeholder="e.g. North_Street"
              value={form.camera_name}
              onChange={(e) => setField('camera_name', e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Video source path */}
          <div>
            <FieldLabel
              htmlFor="video_source"
              label="Video Source Path"
              sub="file path or RTSP URL"
            />
            <input
              id="video_source"
              type="text"
              placeholder="e.g. data/test_videos/test.mp4"
              value={form.video_source}
              onChange={(e) => setField('video_source', e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </section>

        {/* ── System Info ─────────────────────────────────────────────────── */}
        <section className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
          <SectionHeading
            title="System Info"
            description="Read-only — reflects configuration from environment variables"
          />
          <dl className="divide-y divide-slate-700">
            {SYSTEM_INFO.map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2.5">
                <dt className="text-slate-400 text-sm">{label}</dt>
                <dd className="text-slate-200 text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Save ────────────────────────────────────────────────────────── */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
