import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  getViolations, getAccidents, getCounting, getCongestionStatus,
  createCongestionWebSocket,
} from '../services/api';
import ViolationCard from '../components/ViolationCard';
import SignalControl from '../components/SignalControl';

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accentColor, icon, delay = 0 }) {
  return (
    <div
      className="stat-card animate-fade-up"
      style={{ animationDelay: `${delay}ms`, borderLeft: `3px solid ${accentColor || 'var(--border-2)'}` }}
    >
      <div className="flex items-start justify-between">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: 'var(--text-2)' }}
        >
          {label}
        </span>
        {icon && (
          <span style={{ color: accentColor || 'var(--text-3)' }} className="opacity-70">
            {icon}
          </span>
        )}
      </div>
      <span
        className="font-mono font-bold text-[28px] leading-none mt-1"
        style={{ color: accentColor || 'var(--text)' }}
      >
        {value ?? '—'}
      </span>
      {sub && (
        <span className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{sub}</span>
      )}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, badge }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2
        className="text-[11px] font-bold uppercase tracking-[0.14em]"
        style={{ color: 'var(--text-2)' }}
      >
        {title}
      </h2>
      {badge}
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs shadow-xl"
      style={{
        backgroundColor: 'var(--elevated)',
        border: '1px solid var(--border-2)',
        color: 'var(--text)',
      }}
    >
      <p style={{ color: 'var(--text-2)' }}>{label}</p>
      <p className="font-mono font-bold mt-0.5" style={{ color: 'var(--accent)' }}>
        {payload[0].value} violations
      </p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [violations,  setViolations]  = useState([]);
  const [accidents,   setAccidents]   = useState([]);
  const [counting,    setCounting]    = useState(null);
  const [congestion,  setCongestion]  = useState(null);
  const [roadData,    setRoadData]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [wsStatus,    setWsStatus]    = useState('connecting');

  const fetchAll = useCallback(async () => {
    try {
      const [v, a, c, cg] = await Promise.allSettled([
        getViolations({ limit: 20 }),
        getAccidents({ limit: 5 }),
        getCounting(),
        getCongestionStatus(),
      ]);
      if (v.status  === 'fulfilled') setViolations(v.value);
      if (a.status  === 'fulfilled') setAccidents(a.value);
      if (c.status  === 'fulfilled') setCounting(c.value);
      if (cg.status === 'fulfilled') setCongestion(cg.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // WebSocket — live congestion
  useEffect(() => {
    let ws, retryTimer;
    function connect() {
      try {
        ws = createCongestionWebSocket();
        ws.onopen    = () => setWsStatus('live');
        ws.onmessage = evt => {
          try {
            const data = JSON.parse(evt.data);
            if (data.recommendations) {
              setRoadData(data.recommendations.map(r => ({
                road_id:         r.road_id,
                density_index:   r.density_index,
                vehicle_count:   r.vehicle_count   ?? 0,
                time_extension_s: r.time_extension_s ?? 0,
                signal_state:    r.road_id === data.green_road ? 'GREEN' : 'RED',
              })));
            }
            setCongestion(data);
          } catch { /* ignore */ }
        };
        ws.onerror = () => setWsStatus('error');
        ws.onclose = () => { setWsStatus('connecting'); retryTimer = setTimeout(connect, 5000); };
      } catch { setWsStatus('error'); }
    }
    connect();
    return () => { clearTimeout(retryTimer); ws?.close(); };
  }, []);

  // Derived stats
  const totalViolations = violations.length;
  const redCount   = violations.filter(v => v.violation_type === 'RED_LIGHT').length;
  const helmCount  = violations.filter(v => v.violation_type === 'HELMET').length;
  const spdCount   = violations.filter(v => v.violation_type === 'SPEED').length;
  const activeAcc  = accidents.filter(a => !a.resolved).length;

  const pieData = [
    { name: 'Red Light', value: redCount,  fill: 'var(--red)'    },
    { name: 'Helmet',    value: helmCount, fill: 'var(--orange)'  },
    { name: 'Speed',     value: spdCount,  fill: 'var(--yellow)'  },
  ].filter(d => d.value > 0);

  const barData = (() => {
    const hours = {};
    violations.forEach(v => {
      const key = `${String(new Date(v.timestamp).getHours()).padStart(2,'0')}:00`;
      hours[key] = (hours[key] ?? 0) + 1;
    });
    return Object.entries(hours).sort(([a],[b]) => a.localeCompare(b)).map(([hour, count]) => ({ hour, count }));
  })();

  const wsDot = { live: 'var(--green)', connecting: 'var(--yellow)', error: 'var(--red)' }[wsStatus];
  const wsLabel = { live: 'Live', connecting: 'Reconnecting', error: 'Offline' }[wsStatus];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3" style={{ color: 'var(--text-2)' }}>
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-sm">Loading dashboard…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between animate-fade-up">
        <div>
          <h1 className="font-display font-black text-2xl tracking-tight" style={{ color: 'var(--text)' }}>
            Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Real-time traffic violation monitoring
          </p>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ backgroundColor: wsDot }} />
          <span style={{ color: 'var(--text-2)' }}>{wsLabel}</span>
        </div>
      </div>

      {/* ── KPI stats ── */}
      <section>
        <SectionHeader title="Overview" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Total Violations" value={totalViolations}  accentColor="var(--accent)"  delay={0}   />
          <StatCard label="Red Light"         value={redCount}         accentColor="var(--red)"     delay={50}  />
          <StatCard label="Helmet"            value={helmCount}        accentColor="var(--orange)"  delay={100} />
          <StatCard label="Speed"             value={spdCount}         accentColor="var(--yellow)"  delay={150} />
          <StatCard
            label="Active Accidents"
            value={activeAcc}
            accentColor={activeAcc > 0 ? 'var(--red)' : 'var(--green)'}
            sub={activeAcc === 0 ? 'All clear' : 'Needs attention'}
            delay={200}
          />
        </div>
      </section>

      {/* ── Vehicle counts ── */}
      {counting && (
        <section className="animate-fade-up delay-200">
          <SectionHeader title="Vehicle Counts — Today" />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              { label: 'Cars',        value: counting.car_count        ?? 0 },
              { label: 'Motorcycles', value: counting.motorcycle_count ?? 0 },
              { label: 'Buses',       value: counting.bus_count        ?? 0 },
              { label: 'Trucks',      value: counting.truck_count      ?? 0 },
              { label: 'Small',       value: counting.total_small      ?? 0, accent: 'var(--accent)' },
              { label: 'Heavy',       value: counting.total_heavy      ?? 0, accent: 'var(--orange)' },
            ].map(({ label, value, accent }) => (
              <div
                key={label}
                className="card px-4 py-3 flex flex-col gap-1"
              >
                <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>{label}</span>
                <span className="font-mono font-bold text-xl" style={{ color: accent || 'var(--text)' }}>{value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Charts ── */}
      <section className="animate-fade-up delay-300">
        <SectionHeader title="Analytics" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Bar — violations by hour */}
          <div className="card p-5">
            <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Violations by Hour</p>
            {barData.length ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} margin={{ top: 2, right: 4, left: -24, bottom: 0 }}>
                  <XAxis
                    dataKey="hour"
                    tick={{ fill: 'var(--text-2)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-2)', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent-dim)' }} />
                  <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-44 flex items-center justify-center text-sm italic" style={{ color: 'var(--text-3)' }}>
                No violation data
              </div>
            )}
          </div>

          {/* Pie — type breakdown */}
          <div className="card p-5">
            <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Violation Type Breakdown</p>
            {pieData.length ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData} cx="50%" cy="50%"
                    innerRadius={45} outerRadius={70}
                    paddingAngle={4} dataKey="value"
                  >
                    {pieData.map(entry => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Legend
                    iconType="circle" iconSize={8}
                    formatter={value => (
                      <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{value}</span>
                    )}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--elevated)',
                      border: '1px solid var(--border-2)',
                      borderRadius: 10,
                      color: 'var(--text)',
                    }}
                    itemStyle={{ color: 'var(--text)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-44 flex items-center justify-center text-sm italic" style={{ color: 'var(--text-3)' }}>
                No violation data
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Signal control ── */}
      <section className="animate-fade-up delay-350">
        <SectionHeader
          title="Signal Control & Congestion"
          badge={congestion?.computed_at && (
            <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
              Updated {new Date(congestion.computed_at).toLocaleTimeString()}
            </span>
          )}
        />
        <SignalControl roadData={roadData} />
      </section>

      {/* ── Recent violations ── */}
      <section className="animate-fade-up delay-400">
        <SectionHeader title="Recent Violations" />
        {violations.slice(0, 6).length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {violations.slice(0, 6).map(v => <ViolationCard key={v.id} violation={v} />)}
          </div>
        ) : (
          <div className="card py-12 text-center text-sm italic" style={{ color: 'var(--text-3)' }}>
            No violations recorded yet.
          </div>
        )}
      </section>

      {/* ── Active accident alerts ── */}
      {activeAcc > 0 && (
        <section className="animate-fade-up delay-500">
          <SectionHeader title="Active Accident Alerts" />
          <div className="flex flex-col gap-2">
            {accidents.filter(a => !a.resolved).map(a => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
                style={{ backgroundColor: 'var(--red-dim)', border: '1px solid var(--red)', color: 'var(--red)' }}
              >
                <span className="w-2 h-2 rounded-full animate-pulse-dot flex-shrink-0" style={{ backgroundColor: 'var(--red)' }} />
                <span className="font-bold">{a.alert_type}</span>
                <span className="flex-1" style={{ color: 'var(--text-2)' }}>{a.road_id ?? 'Unknown road'}</span>
                <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                  {new Date(a.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
