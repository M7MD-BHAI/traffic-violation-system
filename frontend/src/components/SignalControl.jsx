function CongestionBar({ value }) {
  const pct   = Math.min(100, Math.max(0, value));
  const color = pct >= 70 ? 'var(--red)' : pct >= 40 ? 'var(--orange)' : 'var(--green)';
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--elevated)' }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

const SIGNAL_CFG = {
  RED:     { color: 'var(--red)',    bg: 'var(--red-dim)',    dot: '#f87171' },
  GREEN:   { color: 'var(--green)',  bg: 'var(--green-dim)',  dot: '#34d399' },
  YELLOW:  { color: 'var(--yellow)', bg: 'var(--yellow-dim)', dot: '#fbbf24' },
  UNKNOWN: { color: 'var(--text-2)', bg: 'var(--elevated)',   dot: '#6e8aaa' },
};

export default function SignalControl({ roadData = [] }) {
  if (!roadData.length) {
    return (
      <div className="text-sm italic py-4" style={{ color: 'var(--text-3)' }}>
        No road data available.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {roadData.map((road, i) => {
        const ci         = road.density_index ?? 0;
        const ciLabel    = ci >= 70 ? 'High' : ci >= 40 ? 'Moderate' : 'Low';
        const ciColor    = ci >= 70 ? 'var(--red)' : ci >= 40 ? 'var(--orange)' : 'var(--green)';
        const state      = (road.signal_state || 'UNKNOWN').toUpperCase();
        const sig        = SIGNAL_CFG[state] || SIGNAL_CFG.UNKNOWN;

        return (
          <div
            key={road.road_id}
            className="card p-4 flex flex-col gap-3 animate-fade-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                {road.road_id}
              </span>
              <span
                className="badge text-[10px] flex items-center gap-1.5 flex-shrink-0"
                style={{ backgroundColor: sig.bg, color: sig.color }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ backgroundColor: sig.dot }}
                />
                {state}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>Congestion Index</span>
                <span className="font-mono font-bold" style={{ color: ciColor }}>
                  {ci} — {ciLabel}
                </span>
              </div>
              <CongestionBar value={ci} />
            </div>

            <div className="flex justify-between text-xs" style={{ color: 'var(--text-2)' }}>
              <span>
                <span style={{ color: 'var(--text)' }}>{road.vehicle_count ?? 0}</span> vehicles
              </span>
              {road.time_extension_s > 0 && (
                <span className="font-semibold" style={{ color: 'var(--yellow)' }}>
                  +{road.time_extension_s}s ext
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
