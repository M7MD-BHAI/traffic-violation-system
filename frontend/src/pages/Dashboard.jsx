import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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

const typeColors = {
  RED_LIGHT: 'var(--red)',
  HELMET: 'var(--orange)',
  SPEED: 'var(--yellow)',
};

const Icon = {
  pulse: (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2.2-6 4.6 12 2.2-6h5" />
    </svg>
  ),
  alert: (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L2.8 17a2 2 0 001.7 3h15a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </svg>
  ),
  car: (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.8 13.5l1.5-5A2 2 0 017.2 7h9.6a2 2 0 011.9 1.5l1.5 5M5 17h.01M19 17h.01M4 13.5h16v4.8a1.7 1.7 0 01-1.7 1.7H17a1.5 1.5 0 01-1.5-1.5h-7A1.5 1.5 0 017 20H5.7A1.7 1.7 0 014 18.3v-4.8z" />
    </svg>
  ),
  signal: (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7h.01M12 12h.01M12 17h.01" />
    </svg>
  ),
};

function EmptyState({ label }) {
  return (
    <div className="empty-state">
      <span>{label}</span>
    </div>
  );
}

function MetricCard({ label, value, detail, tone, icon }) {
  return (
    <article className="dash-metric-card">
      <div className="metric-card-head">
        <span style={{ color: tone }}>{icon}</span>
        <small>{label}</small>
      </div>
      <strong style={{ color: tone }}>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dash-tooltip">
      <span>{label}</span>
      {payload.map((item) => (
        <strong key={item.dataKey} style={{ color: item.color || item.fill }}>
          {item.name}: {item.value}
        </strong>
      ))}
    </div>
  );
}

function SectionTitle({ eyebrow, title, action }) {
  return (
    <div className="section-title">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function VehicleBreakdown({ counting }) {
  const values = [
    { label: 'Cars', value: counting?.car_count ?? 0, color: 'var(--accent)' },
    { label: 'Motorcycles', value: counting?.motorcycle_count ?? 0, color: 'var(--green)' },
    { label: 'Buses', value: counting?.bus_count ?? 0, color: 'var(--orange)' },
    { label: 'Trucks', value: counting?.truck_count ?? 0, color: 'var(--yellow)' },
  ];
  const total = values.reduce((sum, item) => sum + item.value, 0) || 1;

  return (
    <div className="vehicle-strip">
      {values.map((item) => (
        <div key={item.label} className="vehicle-pill">
          <span>
            <i style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
          <strong>{item.value}</strong>
          <div>
            <b style={{ width: `${Math.max((item.value / total) * 100, item.value ? 10 : 3)}%`, backgroundColor: item.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [violations, setViolations] = useState([]);
  const [accidents, setAccidents] = useState([]);
  const [counting, setCounting] = useState(null);
  const [congestion, setCongestion] = useState(null);
  const [roadData, setRoadData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState('connecting');

  const fetchAll = useCallback(async () => {
    try {
      const [v, a, c, cg] = await Promise.allSettled([
        getViolations({ limit: 20 }),
        getAccidents({ limit: 8 }),
        getCounting(),
        getCongestionStatus(),
      ]);
      if (v.status === 'fulfilled') setViolations(Array.isArray(v.value) ? v.value : []);
      if (a.status === 'fulfilled') setAccidents(Array.isArray(a.value) ? a.value : []);
      if (c.status === 'fulfilled') setCounting(c.value);
      if (cg.status === 'fulfilled') setCongestion(cg.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    let ws;
    let retryTimer;
    const connect = () => {
      try {
        ws = createCongestionWebSocket();
        ws.onopen = () => setWsStatus('live');
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.recommendations) {
              setRoadData(data.recommendations.map((road) => ({
                road_id: road.road_id,
                density_index: road.density_index,
                vehicle_count: road.vehicle_count ?? 0,
                time_extension_s: road.time_extension_s ?? 0,
                signal_state: road.road_id === data.green_road ? 'GREEN' : 'RED',
              })));
            }
            setCongestion(data);
          } catch {
            setWsStatus('error');
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
    };
    connect();
    return () => {
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  const stats = useMemo(() => {
    const redCount = violations.filter((v) => v.violation_type === 'RED_LIGHT').length;
    const helmetCount = violations.filter((v) => v.violation_type === 'HELMET').length;
    const speedCount = violations.filter((v) => v.violation_type === 'SPEED').length;
    const activeAccidents = accidents.filter((a) => !a.resolved).length;
    const vehicleTotal = (counting?.car_count ?? 0)
      + (counting?.motorcycle_count ?? 0)
      + (counting?.bus_count ?? 0)
      + (counting?.truck_count ?? 0);
    return { redCount, helmetCount, speedCount, activeAccidents, vehicleTotal };
  }, [accidents, counting, violations]);

  const hourlyData = useMemo(() => {
    const buckets = {};
    violations.forEach((violation) => {
      const hour = `${String(new Date(violation.timestamp).getHours()).padStart(2, '0')}:00`;
      buckets[hour] = (buckets[hour] ?? 0) + 1;
    });
    const data = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({ hour, count }));
    return data.length ? data : [
      { hour: '08:00', count: 0 },
      { hour: '10:00', count: 0 },
      { hour: '12:00', count: 0 },
      { hour: '14:00', count: 0 },
      { hour: '16:00', count: 0 },
    ];
  }, [violations]);

  const densityTrend = useMemo(() => {
    if (roadData.length) {
      return roadData.map((road, index) => ({
        name: road.road_id || `Road ${index + 1}`,
        density: Math.round((road.density_index ?? 0) * 100),
        vehicles: road.vehicle_count ?? 0,
      }));
    }
    return [
      { name: 'North', density: Math.round((congestion?.density_index ?? 0.42) * 100), vehicles: congestion?.vehicle_count ?? 0 },
      { name: 'East', density: 28, vehicles: 0 },
      { name: 'South', density: 35, vehicles: 0 },
      { name: 'West', density: 18, vehicles: 0 },
    ];
  }, [congestion, roadData]);

  const pieData = [
    { name: 'Red Light', value: stats.redCount, color: typeColors.RED_LIGHT },
    { name: 'Helmet', value: stats.helmetCount, color: typeColors.HELMET },
    { name: 'Speed', value: stats.speedCount, color: typeColors.SPEED },
  ].filter((item) => item.value > 0);

  const wsDot = { live: 'var(--green)', connecting: 'var(--yellow)', error: 'var(--red)' }[wsStatus];
  const wsLabel = { live: 'Live stream', connecting: 'Reconnecting', error: 'Offline' }[wsStatus];
  const updatedAt = congestion?.computed_at ? new Date(congestion.computed_at).toLocaleTimeString() : 'Awaiting signal';

  if (loading) {
    return (
      <div className="dashboard-loading">
        <span className="loader-ring" />
        <span>Loading command dashboard...</span>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero">
        <div>
          <span className="eyebrow">Traffic command center</span>
          <h1>Real-time violation and flow intelligence</h1>
          <p>
            Monitor enforcement events, smart signals, congestion pressure, and critical alerts from one operational dashboard.
          </p>
        </div>
        <div className="hero-status-card">
          <span className="live-pill">
            <i style={{ backgroundColor: wsDot }} />
            {wsLabel}
          </span>
          <strong>{updatedAt}</strong>
          <small>Last optimization heartbeat</small>
        </div>
      </header>

      <section className="dash-metric-grid">
        <MetricCard label="Total violations" value={violations.length} detail="Last 20 records" tone="var(--accent)" icon={Icon.pulse} />
        <MetricCard label="Red-light events" value={stats.redCount} detail="Stop-line crossings" tone="var(--red)" icon={Icon.signal} />
        <MetricCard label="Vehicles counted" value={stats.vehicleTotal} detail="Today by class" tone="var(--green)" icon={Icon.car} />
        <MetricCard
          label="Active incidents"
          value={stats.activeAccidents}
          detail={stats.activeAccidents ? 'Dispatch attention' : 'No open accident alerts'}
          tone={stats.activeAccidents ? 'var(--red)' : 'var(--yellow)'}
          icon={Icon.alert}
        />
      </section>

      <section className="dashboard-grid-main">
        <div className="panel panel-map">
          <SectionTitle eyebrow="Road network" title="Congestion hot spots" action={<span className="mini-badge">AI optimized</span>} />
          <div className="traffic-map">
            <div className="map-grid" />
            <div className="road road-a" />
            <div className="road road-b" />
            <div className="road road-c" />
            <span className="hotspot hotspot-a" />
            <span className="hotspot hotspot-b" />
            <span className="hotspot hotspot-c" />
            <div className="map-stat">
              <small>Density index</small>
              <strong>{Math.round((congestion?.density_index ?? densityTrend[0]?.density / 100 ?? 0) * 100)}%</strong>
            </div>
          </div>
          <VehicleBreakdown counting={counting} />
        </div>

        <div className="panel">
          <SectionTitle eyebrow="Violation analytics" title="Hourly enforcement trend" action={<span className="mini-badge">Today</span>} />
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={245}>
              <AreaChart data={hourlyData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="vioGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area name="Violations" type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={3} fill="url(#vioGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <SectionTitle eyebrow="Distribution" title="Violation mix" action={<span className="mini-badge">ANPR linked</span>} />
          {pieData.length ? (
            <div className="pie-layout">
              <ResponsiveContainer width="54%" height={220}>
                <PieChart>
                  <Pie data={pieData} innerRadius={54} outerRadius={82} paddingAngle={5} dataKey="value">
                    {pieData.map((item) => <Cell key={item.name} fill={item.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pie-legend">
                {pieData.map((item) => (
                  <span key={item.name}>
                    <i style={{ backgroundColor: item.color }} />
                    {item.name}
                    <strong>{item.value}</strong>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState label="No violation type data yet" />
          )}
        </div>

        <div className="panel">
          <SectionTitle eyebrow="Optimization" title="Road density by approach" action={<span className="mini-badge">Signal feed</span>} />
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={densityTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar name="Density" dataKey="density" fill="var(--green)" radius={[8, 8, 3, 3]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="panel">
        <SectionTitle eyebrow="Signal control" title="Adaptive congestion panel" action={<span className="mini-badge">Updated {updatedAt}</span>} />
        <SignalControl roadData={roadData} />
      </section>

      <section className="dashboard-bottom-grid">
        <div className="panel">
          <SectionTitle eyebrow="Evidence stream" title="Recent violations" action={<span className="mini-badge">{violations.slice(0, 6).length} shown</span>} />
          {violations.slice(0, 6).length ? (
            <div className="recent-card-grid">
              {violations.slice(0, 6).map((violation) => (
                <ViolationCard key={violation.id} violation={violation} />
              ))}
            </div>
          ) : (
            <EmptyState label="No violations recorded yet" />
          )}
        </div>

        <div className="panel incident-panel">
          <SectionTitle eyebrow="Incident desk" title="Accident alerts" action={<span className="mini-badge">{stats.activeAccidents} active</span>} />
          <div className="incident-table">
            {accidents.slice(0, 5).length ? accidents.slice(0, 5).map((accident) => (
              <div key={accident.id} className="incident-row">
                <span className={accident.resolved ? 'status-dot resolved' : 'status-dot'} />
                <strong>{accident.alert_type || 'Alert'}</strong>
                <small>{accident.road_id || 'Unknown road'}</small>
                <em>{accident.timestamp ? new Date(accident.timestamp).toLocaleTimeString() : '--'}</em>
              </div>
            )) : <EmptyState label="No accident alerts" />}
          </div>
        </div>
      </section>

      <footer className="dashboard-footer">
        <span>TrafficIQ Command Dashboard</span>
        <span>Red light, helmet, speed, ANPR, accidents, congestion</span>
        <span>Operational view for final year project demo</span>
      </footer>
    </div>
  );
}
