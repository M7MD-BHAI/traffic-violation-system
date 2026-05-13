import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

const Icon = {
  camera: (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.8 6.2A2.3 2.3 0 015.2 7.2c-.4.1-.8.1-1.1.2-1.1.2-1.9 1.1-1.9 2.2V18a2.3 2.3 0 002.3 2.3h15A2.3 2.3 0 0021.8 18V9.6c0-1.1-.8-2-1.9-2.2l-1.1-.2a2.3 2.3 0 01-1.6-1l-.8-1.3a2.2 2.2 0 00-1.8-1.1 48.8 48.8 0 00-5.2 0 2.2 2.2 0 00-1.8 1.1l-.9 1.3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.8a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
    </svg>
  ),
  moon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.8 15A9.7 9.7 0 0118 15.8 9.8 9.8 0 018.3 6c0-1.3.3-2.6.7-3.8A9.8 9.8 0 003 11.3 9.8 9.8 0 0012.8 21a9.8 9.8 0 009-6z" />
    </svg>
  ),
  sun: (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.3m6.4.3l-1.6 1.6M21 12h-2.3m-.3 6.4l-1.6-1.6M12 18.8V21m-4.8-4.2l-1.6 1.6M5.3 12H3m4.2-4.8L5.6 5.6M15.8 12a3.8 3.8 0 11-7.6 0 3.8 3.8 0 017.6 0z" />
    </svg>
  ),
  lock: (
    <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.8a4.5 4.5 0 10-9 0v3.7m-.8 10h10.6a2.2 2.2 0 002.2-2.2v-5.6a2.2 2.2 0 00-2.2-2.2H6.7a2.2 2.2 0 00-2.2 2.2v5.6a2.2 2.2 0 002.2 2.2z" />
    </svg>
  ),
};

const metrics = [
  { label: 'Signals synced', value: '04', tone: 'var(--green)' },
  { label: 'AI modules', value: '09', tone: 'var(--accent)' },
  { label: 'ANPR ready', value: 'ON', tone: 'var(--yellow)' },
];

export default function Login() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.username.trim() || !form.password.trim()) {
      setError('Username and password are required.');
      return;
    }
    setLoading(true);
    try {
      await login(form.username.trim(), form.password);
      localStorage.setItem('username', form.username.trim());
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen auth-shell">
      <header className="auth-header">
        <div className="brand-lockup">
          <span className="brand-mark">{Icon.camera}</span>
          <span>
            <strong>TrafficIQ</strong>
            <small>Violation Intelligence Suite</small>
          </span>
        </div>
        <nav className="auth-nav" aria-label="System capabilities">
          <span>Detection</span>
          <span>ANPR</span>
          <span>Optimization</span>
        </nav>
        <button className="icon-button" onClick={toggle} type="button" title="Toggle theme">
          {theme === 'dark' ? Icon.sun : Icon.moon}
        </button>
      </header>

      <main className="auth-main">
        <section className="auth-visual animate-fade-up" aria-label="Traffic operations overview">
          <div className="auth-map-panel">
            <div className="map-grid" />
            <div className="road road-a" />
            <div className="road road-b" />
            <div className="road road-c" />
            <span className="hotspot hotspot-a" />
            <span className="hotspot hotspot-b" />
            <span className="hotspot hotspot-c" />
            <div className="signal-stack">
              <span className="sig-red" />
              <span className="sig-yellow" />
              <span className="sig-green active" />
            </div>
            <div className="map-caption">
              <span>Live corridor</span>
              <strong>Central Monitoring</strong>
            </div>
          </div>

          <div className="auth-copy">
            <span className="eyebrow">Real-time traffic command</span>
            <h1>Secure access for smarter road enforcement.</h1>
            <p>
              Monitor red-light, helmet, speeding, accident, congestion, and license plate events from one polished operations desk.
            </p>
          </div>

          <div className="auth-metrics">
            {metrics.map((item) => (
              <div key={item.label}>
                <span style={{ color: item.tone }}>{item.value}</span>
                <small>{item.label}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="auth-card animate-fade-up delay-100">
          <div className="auth-card-head">
            <div>
              <span className="eyebrow">Operator portal</span>
              <h2>Sign in</h2>
            </div>
            <span className="secure-pill">{Icon.lock} Secure</span>
          </div>

          {error && <div className="form-error">{error}</div>}

          <form onSubmit={handleSubmit} noValidate className="auth-form">
            <label>
              <span>Username</span>
              <input
                className="input-field"
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoFocus
                value={form.username}
                onChange={handleChange}
                disabled={loading}
                placeholder="Enter username"
              />
            </label>

            <label>
              <span>Password</span>
              <input
                className="input-field"
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange}
                disabled={loading}
                placeholder="Enter password"
              />
            </label>

            <div className="form-row">
              <label className="check-line">
                <input type="checkbox" defaultChecked />
                <span>Keep session active</span>
              </label>
              <span>FYP 2026</span>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary auth-submit">
              {loading ? 'Authenticating...' : 'Open Dashboard'}
            </button>
          </form>
        </section>
      </main>

      <footer className="auth-footer">
        <span>Traffic Violation Detection System</span>
        <span>Privacy-aware ANPR</span>
        <span>FastAPI + React Control Center</span>
      </footer>
    </div>
  );
}
