import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  getViolations,
  getAccidents,
  getCounting,
  getCongestionStatus,
  createCongestionWebSocket,
} from '../services/api';
import ViolationCard from '../components/ViolationCard';
import SignalControl from '../components/SignalControl';

// ── Colour palette ────────────────────────────────────────────────────────────
const PIE_COLORS = { RED_LIGHT: '#ef4444', HELMET: '#f97316', SPEED: '#eab308' };

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-slate-400 text-xs uppercase tracking-wide">{label}</span>
      <span className={`text-3xl font-bold ${color}`}>{value ?? '—'}</span>
      {sub && <span className="text-slate-500 text-xs">{sub}</span>}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [violations, setViolations]     = useState([]);
  const [accidents, setAccidents]       = useState([]);
  const [counting, setCounting]         = useState(null);
  const [congestion, setCongestion]     = useState(null);
  const [roadData, setRoadData]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [wsStatus, setWsStatus]         = useState('connecting'); // connecting | live | error

  // ── Initial data fetch ─────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [v, a, c, cg] = await Promise.allSettled([
        getViolations({ limit: 20 }),
        getAccidents({ limit: 5 }),
        getCounting(),
        getCongestionStatus(),
      ]);
      if (v.status === 'fulfilled') setViolations(v.value);
      if (a.status === 'fulfilled') setAccidents(a.value);
      if (c.status === 'fulfilled') setCounting(c.value);
      if (cg.status === 'fulfilled') setCongestion(cg.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── WebSocket — live congestion feed ───────────────────────────────────────
  useEffect(() => {
    let ws;
    let retryTimer;

    function connect() {
      try {
        ws = createCongestionWebSocket();

        ws.onopen = () => setWsStatus('live');

        ws.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            // Build roadData array for SignalControl
            if (data.recommendations) {
              setRoadData(data.recommendations.map((r) => ({
                road_id: r.road_id,
                density_index: r.density_index,
                vehicle_count: r.vehicle_count ?? 0,
                time_extension_s: r.time_extension_s ?? 0,
                signal_state: r.road_id === data.green_road ? 'GREEN' : 'RED',
              })));
            }
            setCongestion(data);
          } catch {
            // malformed frame — ignore
          }
        };

        ws.onerror = () => setWsStatus('error');

        ws.onclose = () => {
          setWsStatus('connecting');
          retryTimer = setTimeout(connect, 5000);
        };
      } catch {
        setWsStatus('error');
      }
    }

    connect();
    return () => {
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalViolations = violations.length;
  const redCount   = violations.filter((v) => v.violation_type === 'RED_LIGHT').length;
  const helmCount  = violations.filter((v) => v.violation_type === 'HELMET').length;
  const spdCount   = violations.filter((v) => v.violation_type === 'SPEED').length;
  const activeAccidents = accidents.filter((a) => !a.resolved).length;

  const pieData = [
    { name: 'Red Light', value: redCount,  fill: PIE_COLORS.RED_LIGHT },
    { name: 'Helmet',    value: helmCount, fill: PIE_COLORS.HELMET },
    { name: 'Speed',     value: spdCount,  fill: PIE_COLORS.SPEED },
  ].filter((d) => d.value > 0);

  // Bar chart — violations grouped by hour (last 20 records)
  const barData = (() => {
    const hours = {};
    violations.forEach((v) => {
      const h = new Date(v.timestamp).getHours();
      const key = `${String(h).padStart(2, '0')}:00`;
      hours[key] = (hours[key] ?? 0) + 1;
    });
    return Object.entries(hours)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({ hour, count }));
  })();

  const recentViolations = violations.slice(0, 6);

  const wsBadge = {
    live:       'bg-green-500',
    connecting: 'bg-yellow-400',
    error:      'bg-red-500',
  }[wsStatus];

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-6 md:px-8 flex flex-col gap-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Real-time traffic monitoring overview
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className={`w-2 h-2 rounded-full ${wsBadge}`} />
          {wsStatus === 'live' ? 'Live' : wsStatus === 'connecting' ? 'Reconnecting…' : 'WS Error'}
        </div>
      </div>

      {/* ── KPI row ── */}
      <Section title="Overview">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Total Violations" value={totalViolations} color="text-white" />
          <StatCard label="Red Light" value={redCount} color="text-red-400" />
          <StatCard label="Helmet" value={helmCount} color="text-orange-400" />
          <StatCard label="Speed" value={spdCount} color="text-yellow-400" />
          <StatCard
            label="Active Accidents"
            value={activeAccidents}
            color={activeAccidents > 0 ? 'text-red-500' : 'text-green-400'}
            sub={activeAccidents === 0 ? 'All clear' : 'Needs attention'}
          />
        </div>
      </Section>

      {/* ── Vehicle counts row ── */}
      {counting && (
        <Section title="Vehicle Counts (Today)">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Cars"        value={counting.car_count ?? 0} />
            <StatCard label="Motorcycles" value={counting.motorcycle_count ?? 0} />
            <StatCard label="Buses"       value={counting.bus_count ?? 0} />
            <StatCard label="Trucks"      value={counting.truck_count ?? 0} />
            <StatCard label="Small"       value={counting.total_small ?? 0} color="text-sky-400" />
            <StatCard label="Heavy"       value={counting.total_heavy ?? 0} color="text-purple-400" />
          </div>
        </Section>
      )}

      {/* ── Charts row ── */}
      <Section title="Analytics">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Bar — violations by hour */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h3 className="text-slate-300 text-sm font-medium mb-4">Violations by Hour</h3>
            {barData.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#cbd5e1' }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm italic">
                No violation data
              </div>
            )}
          </div>

          {/* Pie — type breakdown */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h3 className="text-slate-300 text-sm font-medium mb-4">Violation Type Breakdown</h3>
            {pieData.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Legend
                    iconType="circle"
                    formatter={(value) => (
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>
                    )}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm italic">
                No violation data
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ── Signal / Congestion ── */}
      <Section title="Signal Control & Congestion">
        <SignalControl roadData={roadData} />
        {congestion?.computed_at && (
          <p className="text-slate-500 text-xs mt-1">
            Last optimised: {new Date(congestion.computed_at).toLocaleTimeString()}
          </p>
        )}
      </Section>

      {/* ── Recent violations ── */}
      <Section title="Recent Violations">
        {recentViolations.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentViolations.map((v) => (
              <ViolationCard key={v.id} violation={v} />
            ))}
          </div>
        ) : (
          <div className="text-slate-500 text-sm italic">No violations recorded yet.</div>
        )}
      </Section>

      {/* ── Active accident alerts ── */}
      {activeAccidents > 0 && (
        <Section title="Active Accident Alerts">
          <div className="flex flex-col gap-2">
            {accidents
              .filter((a) => !a.resolved)
              .map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 bg-red-950 border border-red-700 rounded-xl px-4 py-3 text-sm"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                  <span className="text-red-300 font-semibold">{a.alert_type}</span>
                  <span className="text-red-400 flex-1">{a.road_id ?? 'Unknown road'}</span>
                  <span className="text-slate-400 text-xs">
                    {new Date(a.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
          </div>
        </Section>
      )}
    </div>
  );
}
