# Master API Endpoint Reference

Base URL: `http://localhost:8000`
Auth: All endpoints except `/auth/login` require `Authorization: Bearer <token>`

---

## Auth

| Method | Path | Body | Response | Auth |
|---|---|---|---|---|
| POST | `/auth/login` | `{username, password}` | `{access_token, token_type}` | ❌ |
| POST | `/auth/register` | `{username, password, role}` | UserOut | Admin only |
| GET | `/auth/me` | — | UserOut | ✅ |

---

## Violations

| Method | Path | Query | Body | Response |
|---|---|---|---|---|
| POST | `/violations/red-light` | — | ViolationCreate | ViolationOut |
| POST | `/violations/helmet` | — | ViolationCreate | ViolationOut |
| POST | `/violations/speed` | — | ViolationCreate | ViolationOut |
| GET | `/violations` | `type, date_from, date_to, plate, limit, offset` | — | list[ViolationOut] |
| GET | `/violations/{id}` | — | — | ViolationOut |
| DELETE | `/violations/{id}` | — | — | ok (Admin) |

---

## ANPR

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/anpr/{track_id}` | — | PlateResult |
| GET | `/anpr/search` | `plate=ABC123` | list[PlateResult + ViolationOut] |

---

## Vehicles / Analytics

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/vehicles` | `class, limit` | list[VehicleOut] |
| GET | `/analytics/counting` | `date` | CountingReport |
| POST | `/analytics/counting` | — | CountingReport | ok |

---

## Congestion / Optimization

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/congestion/update` | CongestionUpdate | optimisation dict |
| POST | `/congestion/signal-state` | `{road_id, state}` | ok |
| GET | `/congestion/status` | — | optimisation dict |
| **WS** | `/congestion/ws` | — | live JSON stream |

---

## Accidents / Alerts

| Method | Path | Query | Response |
|---|---|---|---|
| POST | `/alerts/accident` | AccidentAlert | ok |
| GET | `/alerts/accident` | `resolved, limit` | list[AccidentAlert] |
| PATCH | `/alerts/accident/{id}/resolve` | — | ok |

---

## Common Response Shapes

```json
// ViolationOut
{
  "id": 1,
  "track_id": 42,
  "violation_type": "RED_LIGHT",
  "timestamp": "2026-04-23T17:00:00Z",
  "image_path": "/static/violations/rl_42.jpg",
  "plate_text": "ABC123",
  "plate_status": "ok",
  "confidence_score": 0.91,
  "speed_kmh": null
}

// PlateResult
{
  "track_id": 42,
  "plate_text": "ABC123",
  "confidence_score": 0.88,
  "status": "ok",
  "message": null,
  "timestamp": "2026-04-23T17:00:01Z"
}

// PlateResult (not visible)
{
  "track_id": 55,
  "plate_text": null,
  "confidence_score": 0.21,
  "status": "plate_not_visible",
  "message": "Plate unreadable. Monitor next camera on North Street.",
  "timestamp": "2026-04-23T17:00:03Z"
}

// WebSocket broadcast (congestion)
{
  "green_road": "East_Avenue",
  "green_ci": 20,
  "recommendations": [
    { "road_id": "North_Street", "density_index": 72, "time_extension_s": 6 }
  ],
  "computed_at": "2026-04-23T17:00:10Z"
}
```
