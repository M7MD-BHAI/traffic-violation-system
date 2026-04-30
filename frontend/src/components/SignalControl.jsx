function CongestionBar({ value }) {
  const pct = Math.min(100, Math.max(0, value));
  const color =
    pct >= 70 ? "bg-red-500" : pct >= 40 ? "bg-amber-400" : "bg-green-500";

  return (
    <div className="w-full bg-slate-700 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const SIGNAL_BADGE = {
  RED: "bg-red-600 text-white",
  GREEN: "bg-green-500 text-white",
  YELLOW: "bg-yellow-400 text-black",
  UNKNOWN: "bg-slate-500 text-white",
};

export default function SignalControl({ roadData = [] }) {
  if (!roadData.length) {
    return (
      <div className="text-slate-400 text-sm italic p-4">
        No road data available.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {roadData.map((road) => {
        const ci = road.density_index ?? 0;
        const ciLabel =
          ci >= 70 ? "High" : ci >= 40 ? "Moderate" : "Low";
        const ciColor =
          ci >= 70 ? "text-red-400" : ci >= 40 ? "text-amber-400" : "text-green-400";
        const signalState = (road.signal_state || "UNKNOWN").toUpperCase();
        const badgeStyle = SIGNAL_BADGE[signalState] || SIGNAL_BADGE.UNKNOWN;

        return (
          <div
            key={road.road_id}
            className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3 border border-slate-700"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-white font-semibold text-sm truncate">
                {road.road_id}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeStyle}`}>
                {signalState}
              </span>
            </div>

            {/* Congestion bar */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Congestion Index</span>
                <span className={`font-bold ${ciColor}`}>
                  {ci} — {ciLabel}
                </span>
              </div>
              <CongestionBar value={ci} />
            </div>

            {/* Stats row */}
            <div className="flex justify-between text-xs text-slate-400">
              <span>
                🚗 <span className="text-white">{road.vehicle_count ?? 0}</span> vehicles
              </span>
              {road.time_extension_s > 0 && (
                <span className="text-amber-400 font-semibold">
                  +{road.time_extension_s}s extension
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
