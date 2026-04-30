const TYPE_STYLES = {
  RED_LIGHT: "bg-red-600 text-white",
  HELMET: "bg-orange-500 text-white",
  SPEED: "bg-yellow-400 text-black",
};

const TYPE_LABELS = {
  RED_LIGHT: "Red Light",
  HELMET: "Helmet",
  SPEED: "Speed",
};

function formatTimestamp(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ViolationCard({ violation }) {
  const {
    violation_type,
    timestamp,
    image_path,
    plate_text,
    plate_status,
    confidence_score,
    speed_kmh,
    track_id,
  } = violation;

  const badgeStyle = TYPE_STYLES[violation_type] || "bg-slate-500 text-white";
  const badgeLabel = TYPE_LABELS[violation_type] || violation_type;

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200 flex flex-col">
      {/* Vehicle image */}
      <div className="h-40 bg-slate-100 flex items-center justify-center overflow-hidden">
        {image_path ? (
          <img
            src={`http://localhost:8000${image_path}`}
            alt="Vehicle"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = "none";
              e.target.nextSibling.style.display = "flex";
            }}
          />
        ) : null}
        <div
          className="w-full h-full flex items-center justify-center text-slate-400 text-sm"
          style={{ display: image_path ? "none" : "flex" }}
        >
          No Image
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Type badge */}
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeStyle}`}>
            {badgeLabel}
          </span>
          <span className="text-xs text-slate-400">#{track_id}</span>
        </div>

        {/* Plate */}
        {plate_status === "plate_not_visible" ? (
          <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full w-fit">
            Plate Not Visible
          </span>
        ) : plate_text ? (
          <span className="text-sm font-mono font-semibold text-slate-800">
            {plate_text}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic">No plate data</span>
        )}

        {/* Speed (only for SPEED type) */}
        {violation_type === "SPEED" && speed_kmh != null && (
          <span className="text-sm font-semibold text-yellow-600">
            {speed_kmh.toFixed(1)} km/h
          </span>
        )}

        <div className="mt-auto flex items-center justify-between pt-1 border-t border-slate-100">
          {/* Timestamp */}
          <span className="text-xs text-slate-500">{formatTimestamp(timestamp)}</span>

          {/* Confidence */}
          {confidence_score != null && (
            <span className="text-xs text-slate-400">
              {(confidence_score * 100).toFixed(0)}% conf
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
