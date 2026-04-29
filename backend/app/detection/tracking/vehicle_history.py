# Shared mutable state across all detection modules.
# Mutated by red_light, speeding, congestion, and accident modules each frame.

speed_map: dict[int, float] = {}   # track_id → latest speed_kmh
y_prev: dict[int, float] = {}      # track_id → previous bottom-centre y coord
