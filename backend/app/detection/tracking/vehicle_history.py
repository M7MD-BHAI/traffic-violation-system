# vehicle_history.py — Shared state store for track history.
# Holds: speed_map { track_id: float }, y_prev { track_id: float }
# Shared across red_light, speeding, congestion, accident modules.
