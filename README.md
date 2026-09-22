# aquas-logging

Logging and dashboard system for AQUAS robot telemetry.

Water-quality readings from the boats and sensor buoys land in a PostgreSQL
(TimescaleDB in production) table. A FastAPI service exposes them through a
fixed set of named queries, and a Next.js dashboard renders summary cards, a
metric trend chart, and a sortable table of recent readings.

```
robots / buoys  ->  waterq.measurements  ->  FastAPI  ->  Next.js dashboard
                    (Postgres/Timescale)     :8000        :3000
```

## Contents

- [Data model](#data-model)
- [Running it locally](#running-it-locally)
- [Environment variables](#environment-variables)
- [API](#api)
- [Seeding data](#seeding-data)
- [Known gaps](#known-gaps)

## Data model

One row per reading, in `waterq.measurements`:

| Column | Type | Meaning |
| --- | --- | --- |
| `time` | `timestamptz` | Reading time, UTC. Not null. |
| `longitude` | `double precision` | Decimal degrees |
| `latitude` | `double precision` | Decimal degrees |
| `temperature_c` | `double precision` | Water temperature, °C |
| `turbidity_ntu` | `double precision` | Turbidity, NTU |
| `ec_us_cm` | `double precision` | Electrical conductivity, µS/cm |
| `tdo_mg_l` | `double precision` | Total dissolved oxygen, mg/L |
| `ph` | `double precision` | pH, 0–14 |

The DDL lives in [`backend/schema.sql`](backend/schema.sql). Note that the API
renames some columns on the way out — `temperature_c` is returned as
`temperature`, `tdo_mg_l` as `dissolved_oxygen`, and `ec_us_cm` as
`electrical_conductivity`, and `time` is returned as a Unix `timestamp`.

Nothing in this repo writes readings. Robots and buoys insert into the table
directly; the API is read-only.

## Running it locally

Needs PostgreSQL 14+, Python 3.11+, and Node 20+.

### 1. Database

```bash
createdb aquas
psql -d aquas -f backend/schema.sql
```

TimescaleDB is optional locally; `schema.sql` has the hypertable step commented
out at the bottom.

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then edit
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Check it: `curl http://localhost:8000/health` → `{"status":"ok"}`

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local    # then edit the credentials
npm install
npm run dev
```

Open http://localhost:3000. You will be redirected to `/login`; sign in with the
`ADMIN_USERNAME` / `ADMIN_PASSWORD` you set in `.env.local`.

## Environment variables

### Backend

Read at startup by `backend/main.py`. Template: `backend/.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_USER` | `postgres` | Database user |
| `POSTGRES_PASSWORD` | `postgres` | Database password |
| `POSTGRES_DB` | `aquas` | Database name |
| `POSTGRES_HOST` | `localhost` | Database host |
| `POSTGRES_PORT` | `5432` | Database port |
| `FRONTEND_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated CORS allowlist |
| `NEXTAUTH_SECRET` | `aquas_test_secret` | JWT key in `backend/auth.py`, which is not wired to any endpoint yet — see [Known gaps](#known-gaps). |

### Frontend

Template: `frontend/.env.example`. Goes in `frontend/.env.local`.

| Variable | Purpose |
| --- | --- |
| `NEXTAUTH_URL` | Base URL NextAuth issues callbacks against (`http://localhost:3000` in dev) |
| `NEXTAUTH_SECRET` | Signs the session JWT. |
| `ADMIN_USERNAME` | The only accepted username |
| `ADMIN_PASSWORD` | The only accepted password |
| `NEXT_PUBLIC_API_BASE` | Backend base URL. Defaults to `http://localhost:8000`. |

## API

### `GET /health`

Liveness check. Returns `{"status": "ok"}`.

### `POST /views/query`

The only data endpoint. The client names a **view** rather than sending SQL; the
server looks the name up in the `VIEW_QUERIES` table in `backend/main.py` and
runs the parameterized query bound to it. Adding a query means editing the
server, not widening what clients may ask for.

Unknown view names return 404. Parameters the view doesn't declare are ignored
rather than rejected, and every declared parameter falls back to its default, so
a request with junk params still returns the default result set.

```bash
curl -X POST http://localhost:8000/views/query \
  -H "Content-Type: application/json" \
  -d '{"view":"all","params":{"limit":50}}'
```

```jsonc
{
  "view": "all",
  "rows": [
    {
      "timestamp": 1790049920,          // Unix seconds
      "longitude": -74.0029,
      "latitude": 40.7176,
      "ph": 7.12,
      "temperature": 13.82,             // from temperature_c
      "dissolved_oxygen": 5.66,         // from tdo_mg_l
      "electrical_conductivity": 521.0, // from ec_us_cm
      "turbidity_ntu": 30.27
    }
  ]
}
```

Available views:

| View | Parameters (defaults) | Returns |
| --- | --- | --- |
| `all` | `limit` (200) | Most recent readings |
| `water-quality` | `hours` (168), `limit` (200) | Readings within the last *n* hours |
| `conductivity` | `limit` (200) | Most recent readings where `ec_us_cm` is not null |
| `ph-neutral` | `min_ph` (7), `max_ph` (10), `limit` (200) | Readings with pH in range |
| `overview` | `limit` (200) | Same as `all`; kept for compatibility |
| `recent_ph` | `days` (7) | Timestamp and pH only, last *n* days |

The dashboard uses `all` (cards, chart, and table) plus `water-quality`,
`conductivity`, and `ph-neutral` for the table's view selector.

## Seeding data

`backend/load_fake_data.py` generates synthetic readings so the dashboard can be
developed against realistic time series.

```bash
python backend/load_fake_data.py --weeks 12 --interval-mins 30 --no-truncate
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--weeks` | 4 | Weeks of history to generate, ending now |
| `--interval-mins` | 15 | Spacing between readings |
| `--lat` / `--lon` | 37.7749 / -122.4194 | Center point for jittered coordinates |
| `--jitter` | 0.01 | Coordinate jitter, decimal degrees |
| `--no-truncate` | off | Append instead of wiping the table |

> ⚠️ Without `--no-truncate` the script runs `TRUNCATE TABLE waterq.measurements`
> first. Don't run it against a database with real readings.

It reads the same `POSTGRES_*` variables as the API, except that
`POSTGRES_DB` defaults to `postgres` rather than `aquas` — pass it explicitly.

The chart filters against the current time, so data older than the selected
window won't appear. Seed with `--weeks` covering the range you want to see.

## Known gaps

Things that look wired up but aren't, so nobody has to rediscover them:

- **The API has no authentication.** `backend/auth.py` defines
  `get_current_user`, but nothing imports it — no endpoint declares it as a
  dependency. Anyone who can reach port 8000 can read every measurement. The
  dashboard's login only gates the UI.
- **Login is a single hardcoded account.** The NextAuth credentials provider
  string-compares against `ADMIN_USERNAME` / `ADMIN_PASSWORD`. There is no user
  table, no password hashing, and no signup path. Real accounts need a user
  store first.
- **`frontend/components/signup-form.tsx` and `login-form.tsx` are unused.**
  `app/login/page.tsx` has its own inline form. They look like the start of the
  accounts feature above, so they were kept rather than deleted.
- **`frontend/scripts/datagen.ts`** (`npm run datagen`) writes
  `frontend/mocks/sensor-data.json`. That mock file is not read by the app; the
  dashboard always fetches from the API. Kept as a working generator.
- **The dashboard is one page.** The sidebar lists only Dashboard; the shadcn
  template's placeholder sections were removed rather than left pointing at
  `#`. Add entries back to `navMain` in `components/app-sidebar.tsx` as real
  routes land.
- **No ingest endpoint.** Writes go straight to Postgres, so anything inserting
  readings needs database credentials rather than an API token.
