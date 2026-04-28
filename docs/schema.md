# Database Schema

## Table: users

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK, autoincrement |
| username | VARCHAR(50) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| role | VARCHAR(20) | DEFAULT 'operator' |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMP | DEFAULT now() |

---

## Table: violations

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK, autoincrement |
| track_id | INTEGER | NOT NULL, INDEX |
| violation_type | VARCHAR(20) | NOT NULL — RED_LIGHT / HELMET / SPEED |
| timestamp | TIMESTAMP | NOT NULL |
| image_path | VARCHAR(255) | nullable |
| plate_text | VARCHAR(20) | nullable |
| plate_status | VARCHAR(30) | nullable — ok / plate_not_visible |
| confidence_score | FLOAT | nullable |
| speed_kmh | FLOAT | nullable — populated for SPEED type only |
| speed_limit | FLOAT | nullable |
| bbox | JSON | [x1, y1, x2, y2] |
| road_id | VARCHAR(50) | nullable |
| frame_idx | INTEGER | nullable |
| merged_with | INTEGER | FK → violations.id, nullable |
| created_at | TIMESTAMP | DEFAULT now() |

---

## Table: vehicles

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK, autoincrement |
| track_id | INTEGER | UNIQUE, INDEX |
| class_name | VARCHAR(30) | car / motorcycle / bus / truck |
| class_group | VARCHAR(10) | small / medium / heavy |
| first_seen | TIMESTAMP | NOT NULL |
| last_seen | TIMESTAMP | NOT NULL |

---

## Table: counting_reports

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK, autoincrement |
| timestamp | TIMESTAMP | NOT NULL |
| interval_minutes | INTEGER | DEFAULT 1 |
| car_count | INTEGER | DEFAULT 0 |
| motorcycle_count | INTEGER | DEFAULT 0 |
| bus_count | INTEGER | DEFAULT 0 |
| truck_count | INTEGER | DEFAULT 0 |
| total_small | INTEGER | DEFAULT 0 |
| total_medium | INTEGER | DEFAULT 0 |
| total_heavy | INTEGER | DEFAULT 0 |

---

## Table: accidents

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK, autoincrement |
| alert_type | VARCHAR(20) | STAGNATION / CRASH |
| track_ids | JSON | list of int |
| timestamp | TIMESTAMP | NOT NULL |
| road_id | VARCHAR(50) | nullable |
| clip_path | VARCHAR(255) | nullable |
| bbox | JSON | union bounding box |
| resolved | BOOLEAN | DEFAULT false |
| created_at | TIMESTAMP | DEFAULT now() |

---

## Table: plate_results

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK, autoincrement |
| violation_id | INTEGER | FK → violations.id |
| track_id | INTEGER | INDEX |
| plate_text | VARCHAR(20) | nullable |
| confidence_score | FLOAT | nullable |
| status | VARCHAR(30) | ok / plate_not_visible / ocr_failed |
| message | TEXT | nullable — next-camera alert text |
| timestamp | TIMESTAMP | NOT NULL |

---

## Table: congestion_snapshots

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PK, autoincrement |
| road_id | VARCHAR(50) | NOT NULL, INDEX |
| density_index | INTEGER | 0–100 |
| vehicle_count | INTEGER | NOT NULL |
| stagnant_count | INTEGER | DEFAULT 0 |
| timestamp | TIMESTAMP | NOT NULL |

---

## Relationships

```
violations   ──▶  plate_results  (1 violation → 1 plate result)
violations   ──▶  violations     (merged_with — self-referential)
plate_results ──▶ violations     (FK)
```
