# AQUAS — Water Quality Monitoring Platform

## Product Spec

AQUAS is a platform where water quality researchers deploy sensor-equipped robots to bodies of water. Each researcher signs up (email/password or Google OAuth), claims their robots by serial number, and views real-time and historical water quality data on a dashboard.

**Data flow:** Robot → MQTT broker → TimescaleDB → FastAPI → Next.js dashboard

**Current scope:** DB → Frontend only. MQTT ingestion is deferred until the sim card module is ready.

**Auth:** NextAuth owns authentication (email/password + Google OAuth). The backend validates NextAuth JWTs on protected requests and auto-provisions the user record in the DB on first API call. For email/password users, the backend stores and verifies password hashes — NextAuth's CredentialsProvider calls the backend to authorize.

**Users:** No roles. All users are equal. Each user can only see data from robots they have claimed. A user can have multiple robots.

**Robot lifecycle:** Robot records are pre-created in the DB (provisioning method TBD — likely a robot token from the hardware side). Users claim robots by entering the serial number in the dashboard. A claimed robot cannot be reclaimed by another user. Robot management (commands, configuration) lives in a separate ROS platform — AQUAS is view-only.

**Dashboard:** User selects a single robot to view its data, or toggles compare mode to overlay multiple robots on the same charts and maps. Filtering via form controls (date range, metric sliders) and a restricted SQL editor for power users.

**Real-time:** Polling every 30-60 seconds for now. WebSocket push layer planned for the future.

---

## Phase 1: Database Schema & Migrations

### 1.1 Create Migration System

- [x] Create `backend/migrations/` folder
- [x] Create `000_init_schema.sql` — current `waterq.measurements` hypertable schema (from README)
- [x] Make migrations idempotent (`CREATE TABLE IF NOT EXISTS`, etc. — safe to re-run)
- [x] Test: `docker exec -i timescaledb psql -U postgres -d aquas -f - < backend/migrations/000_init_schema.sql`

### 1.2 Create Users Table

**Migration:** `001_users.sql`

- [x] Create `waterq.users`:
  | Column | Type | Constraints |
  |--------|------|-------------|
  | `id` | UUID | PK, default `gen_random_uuid()` |
  | `email` | TEXT | UNIQUE, NOT NULL |
  | `password_hash` | TEXT | NULLABLE (null for Google OAuth users) |
  | `display_name` | TEXT | NULLABLE |
  | `created_at` | TIMESTAMPTZ | default `now()` |
- [ ] Create unique index on `email`

### 1.3 Create Robots Table

**Migration:** `001_robots.sql`

- [x] Create `waterq.robots`:
  | Column | Type | Constraints |
  |--------|------|-------------|
  | `robot_id` | UUID | PK, default `gen_random_uuid()` |
  | `user_id` | UUID | NULLABLE FK → `users.id` (null = unclaimed) |
  | `name` | TEXT | NOT NULL |
  | `serial_number` | TEXT | UNIQUE, NOT NULL |
  | `last_seen_at` | TIMESTAMPTZ | NULLABLE |
  | `last_longitude` | DOUBLE PRECISION | NULLABLE |
  | `last_latitude` | DOUBLE PRECISION | NULLABLE |
  | `is_active` | BOOLEAN | default TRUE |
  | `created_at` | TIMESTAMPTZ | default `now()` |
- [ ] Create index on `user_id`
- [ ] Create index on `serial_number`
- [ ] MQTT columns (`mqtt_username`, `mqtt_password`) deferred until ingestion pipeline is built

### 1.4 Add robot_id to Measurements

**Migration:** `002_measurements_robot_id.sql`

- [x] `ALTER TABLE waterq.measurements ADD COLUMN robot_id UUID`
- [x] Create index on `(robot_id, time DESC)` for per-robot time-series queries
- [x] **No FK constraint** on the hypertable — enforce robot_id validity in the application layer

### 1.5 Add Continuous Aggregations

**Migration:** `003_continuous_aggregations.sql`

- [x] Create materialized view `waterq.measurements_hourly`:
  - `time_bucket('1 hour', time)` AS `bucket`
  - `robot_id`
  - AVG: `temperature_c`, `turbidity_ntu`, `ec_us_cm`, `tdo_mg_l`, `ph`
  - MIN/MAX: `temperature_c`
  - `COUNT(*)` AS `sample_count`
- [x] Add refresh policy: refresh every 1 hour, covering the last 3 hours of data
- [x] Test: verify aggregated averages match raw data
-- ran this as the test command in dockert exec -it timescaldb psql -U postgres -d aquas ---> quas=#  
SELECT
      h.bucket,
      h.robot_id,
      h.avg_temperature_c   AS hourly_avg,
      AVG(m.temperature_c)  AS raw_avg,
      h.sample_count        AS hourly_count,
      COUNT(*)              AS raw_count
  FROM waterq.measurements_hourly h
  JOIN waterq.measurements m
      ON time_bucket('1 hour', m.time) = h.bucket
      AND m.robot_id = h.robot_id
  GROUP BY h.bucket, h.robot_id, h.avg_temperature_c, h.sample_count
  HAVING ROUND(h.avg_temperature_c::numeric, 4) != ROUND(AVG(m.temperature_c)::numeric, 4)
     OR h.sample_count != COUNT(*);
 

### 1.6 Add Compression & Retention Policies

**Migration:** `004_compression_retention.sql`

- [x] Enable TimescaleDB compression on `waterq.measurements` for chunks older than 7 days
- [x] Test: verify compression activates and old chunks compress

### 1.7 Update Fake Data Script

- [x] Update `load_fake_data.py`:
  - Create a test user (`test@aquas.dev`, password: `testpassword`)
  - Create 2 test robots linked to that user (with serial numbers)
  - Assign `robot_id` to all generated measurements (split between the 2 robots)
- [x] Add `bcrypt` to `requirements.txt` for password hashing in the script

---

## Phase 2: Backend API & Auth

### 2.1 Add Missing Dependencies

**Note:** `requirements.txt` currently only has `fastapi`, `uvicorn`, `asyncpg`, `jsonschema`. The following were listed as done in the old task list but are NOT in the file:

- [x] Add `bcrypt` to `requirements.txt`
- [x] Add `PyJWT` to `requirements.txt`
- [x] Add `gunicorn` to `requirements.txt`

### 2.2 Refactor Code Structure

Do this FIRST, before adding new endpoints.

- [x] Create `backend/db.py` — extract the asyncpg pool setup from `main.py` into a shared module
- [x] Create `backend/routes/` folder:
  - `routes/view_routes.py` — move existing `/views/query` endpoint here
  - `routes/robot_routes.py` — new robot endpoints (claim, list, data)
  - `routes/auth_routes.py` — new auth endpoints (register, verify)
- [x] Update `main.py` to import and mount route files with `APIRouter`
- [x] Verify the existing dashboard still works after the refactor

### 2.3 Update Auth Middleware

**Blocked by:** Phase 1.2 (users table must exist)

- [x] Rewrite `backend/auth.py`:
  - Decode NextAuth JWTs using `NEXTAUTH_SECRET` + HS256
  - Extract user email from the token payload
  - Query `waterq.users` by email
  - If user doesn't exist: auto-create (upsert) with email + display_name from token
  - Return the full user record (`id`, `email`, `display_name`) to route handlers
  - Return `401` for missing, expired, or invalid tokens
- [x] Expose `get_current_user` as a FastAPI dependency for all protected routes

### 2.4 POST /auth/register

**Blocked by:** Phase 1.2, Phase 2.3

Public endpoint for email/password registration. Called by the frontend registration page.

- [x] Accept body: `{ "email": string, "password": string, "display_name": string (optional) }`
- [x] Validate: email format, password min 8 chars
- [x] Hash password with `bcrypt`
- [x] Insert into `waterq.users`
- [x] Return `201` on success
- [x] Return `409` if email already exists

### 2.5 POST /auth/verify

**Blocked by:** Phase 1.2

Called by NextAuth's CredentialsProvider `authorize` callback to check email/password.

- [x] Accept body: `{ "email": string, "password": string }`
- [x] Look up user by email
- [x] Verify password with `bcrypt.checkpw()`
- [x] Return `200` with `{ id, email, display_name }` if valid
- [x] Return `401` if invalid credentials
- [ ] **Security:** This endpoint should only be callable from the frontend server (same network), not publicly exposed in production ---> dockerize and put firewall so only the frontend can access this

### 2.6 POST /robots/claim

**Blocked by:** Phase 1.3 (robots table), Phase 2.3 (auth middleware)

- [ ] Require authentication (JWT via `get_current_user`)
- [ ] Accept body: `{ "serial_number": string }`
- [ ] Look up robot by `serial_number`
  - `404` if serial number not found in DB
  - `409` if robot's `user_id` is already set (claimed by someone)
- [ ] Set `user_id` to the logged-in user's ID
- [ ] Return `200` with robot details (`robot_id`, `name`, `serial_number`)

### 2.7 GET /robots/me

**Blocked by:** Phase 2.3 (auth middleware)

- [ ] Require authentication
- [ ] Query `waterq.robots WHERE user_id = $1`
- [ ] Return: `[{ robot_id, name, serial_number, is_active, last_seen_at, last_latitude, last_longitude }]`

### 2.8 GET /robots/{robot_id}/data

**Blocked by:** Phase 1.4 (robot_id on measurements), Phase 2.3 (auth middleware)

- [ ] Require authentication
- [ ] Ownership check: verify the robot's `user_id` matches logged-in user → `403` if not
- [ ] Query parameters:
  - `hours` (int, default 24) — return last N hours of data
  - `start_time` (ISO 8601, optional) — explicit start of range
  - `end_time` (ISO 8601, optional) — explicit end of range
- [ ] For ranges > 48 hours: query `measurements_hourly` (continuous aggregation) instead of raw table
- [ ] Return: `{ robot_id, rows: [{ timestamp, longitude, latitude, ph, temperature, dissolved_oxygen, electrical_conductivity, turbidity_ntu }] }`

### 2.9 POST /robots/{robot_id}/query

**Blocked by:** Phase 2.8

Restricted SQL query endpoint for the advanced filter/editor feature.

- [ ] Require authentication + ownership check
- [ ] Accept body:
  ```json
  {
    "where": "ph > 7 AND temperature_c < 25",
    "order_by": "time DESC",
    "limit": 200
  }
  ```
- [ ] **Allowed columns in WHERE:** `ph`, `temperature_c`, `turbidity_ntu`, `ec_us_cm`, `tdo_mg_l`, `time`, `longitude`, `latitude`
- [ ] **Allowed operators:** `=`, `>`, `<`, `>=`, `<=`, `!=`, `AND`, `OR`, `BETWEEN`, `IS NULL`, `IS NOT NULL`
- [ ] **Reject:** subqueries, joins, semicolons, `DROP`, `DELETE`, `UPDATE`, `INSERT`, comments (`--`, `/*`)
- [ ] Always prepend `WHERE robot_id = $1 AND (...)` — user can never query another robot's data
- [ ] `limit` max 1000, default 200
- [ ] Return same row format as `GET /robots/{robot_id}/data`

### 2.10 Update Existing /views/query

- [ ] Add authentication (`get_current_user` dependency)
- [ ] Scope all existing view queries by injecting `robot_id IN (SELECT robot_id FROM waterq.robots WHERE user_id = $1)`
- [ ] Keep backward compatibility with existing frontend until dashboard is updated to use new endpoints

---

## Phase 3: Frontend Auth & Registration

### 3.1 Fix JWT Passing to Backend

**Current bug:** `session.user.accessToken` is set to `JSON.stringify(token)` (the decoded token object). The backend needs the actual encoded JWT string.

- [ ] Update NextAuth config to pass the raw encoded JWT to the session
- [ ] Update all frontend API calls to include `Authorization: Bearer <jwt>` header
- [ ] Verify backend `auth.py` successfully decodes the token

### 3.2 Add Google OAuth Provider

- [ ] Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`
- [ ] Update `[...nextauth]/route.ts`:
  - Add `GoogleProvider` alongside `CredentialsProvider`
  - Ensure JWT callback handles both provider types (Google user has email from profile, credentials user has email from form)

### 3.3 Update CredentialsProvider

- [x] Change `authorize` callback to call backend `POST /auth/verify` with email + password
- [x] Remove hardcoded `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars
- [x] Return user object from backend response (`id`, `email`, `display_name`)

### 3.4 Create Registration Page

- [ ] Create `/register` route and page
- [ ] Form fields: email, password, confirm password, display name (optional)
- [ ] Client-side validation: email format, password min 8 chars, passwords match
- [ ] On submit: call backend `POST /auth/register`
  - Success → redirect to `/login` with success message
  - `409` → show "email already taken" error
- [ ] Link: "Already have an account? Sign in"

### 3.5 Update Login Page

- [ ] Change username field to email field
- [ ] Add "Sign in with Google" button
- [ ] Add "Don't have an account? Register" link
- [ ] Style consistently with registration page

---

## Phase 4: Dashboard Features

### 4.1 Robot Selector & Multi-Robot View

**Blocked by:** Phase 2.7 (GET /robots/me), Phase 2.8 (GET /robots/{robot_id}/data)

- [ ] Fetch user's robots from `GET /robots/me` on mount
- [ ] Add robot selector dropdown (sidebar or header) — default to first robot
- [ ] "Compare" mode toggle:
  - Switches dropdown to multi-select
  - Each robot gets a distinct color across all visualizations
- [ ] All components (cards, chart, table) refetch when selected robot changes
- [ ] Switch API calls from `/views/query` to `GET /robots/{robot_id}/data`

### 4.2 Robot Claim Page

**Blocked by:** Phase 2.6 (POST /robots/claim)

- [ ] Create `/robots/claim` route (or modal accessible from sidebar)
- [ ] Form: serial number input
- [ ] On submit: call `POST /robots/claim`
  - `200` → show robot name, refresh robot list, redirect to dashboard
  - `404` → "Robot not found — check the serial number"
  - `409` → "This robot is already claimed"
- [ ] Show "Claim a Robot" prompt in sidebar when user has 0 robots

### 4.3 Form-Based Filter Panel

- [ ] Add collapsible filter panel above the data table
- [ ] Controls:
  - Date range picker (start date / end date)
  - Metric range sliders: pH (0–14), temperature (-5–80), turbidity (0–100+), EC (0–2000+), TDO (0–20+)
  - Robot selector (when in multi-robot compare mode)
- [ ] "Apply Filters" sends request to `GET /robots/{robot_id}/data` with `start_time` / `end_time`
- [ ] Metric sliders filter client-side from the fetched data (or pass to query endpoint)
- [ ] "Reset" clears all filters
- [ ] Persist filters in URL query params for shareable links

### 4.4 SQL Query Editor

- [ ] Add "Advanced Query" tab alongside the form-based filter panel
- [ ] Code editor component (e.g., `@monaco-editor/react` or `react-simple-code-editor`)
- [ ] SQL syntax highlighting
- [ ] Pre-populated template: `ph > 7 AND temperature_c < 25 AND time > now() - interval '24 hours'`
- [ ] "Run Query" button sends WHERE clause to `POST /robots/{robot_id}/query`
- [ ] Results render in the existing data table
- [ ] Display backend validation errors inline (e.g., "disallowed keyword: DROP")
- [ ] **Note:** Users write WHERE clauses only — SELECT and FROM are fixed by the backend

### 4.5 Geospatial Map — Scatter

- [ ] Install `react-map-gl` + `maplibre-gl` (no API key needed)
- [ ] Add map component to dashboard layout (below chart, above table)
- [ ] Plot a dot at each measurement's `(longitude, latitude)`
- [ ] Color dots by the currently selected metric (gradient: green → yellow → red based on value)
- [ ] Tooltip on hover: timestamp + all metric values for that reading
- [ ] Sync with the active time range from the filter panel

### 4.6 Geospatial Map — Path/Track

**Blocked by:** Phase 4.5 (map component exists)

- [ ] Draw a line connecting measurement points in chronological order
- [ ] Line color: gradient from faded to solid (old → recent)
- [ ] Single-robot view: one path
- [ ] Multi-robot compare mode: each robot gets a distinct colored path

### 4.7 Geospatial Map — Heatmap Layer

**Blocked by:** Phase 4.5

- [ ] Add heatmap toggle button on the map
- [ ] Intensity driven by the currently selected metric (e.g., turbidity hotspots)
- [ ] Dropdown to select which metric drives the heatmap
- [ ] Answers: "where are the worst readings for X metric?"

### 4.8 Geospatial Map — Time Animation

**Blocked by:** Phase 4.5

- [ ] Add time slider below the map
- [ ] Scrubbing the slider shows only measurements within a time window
- [ ] Play / pause button to auto-advance through time
- [ ] Speed control: 1x, 2x, 5x
- [ ] Dots appear/disappear and change color as time progresses

### 4.9 Update Section Cards

- [ ] Refactor to use `GET /robots/{robot_id}/data` instead of `/views/query`
- [ ] In multi-robot compare mode: show per-robot breakdown or combined averages (toggle)
- [ ] Color-coded status indicators:
  - **Green (normal):** pH 6.5–8.5, temp 5–25, turbidity < 10, TDO > 6
  - **Yellow (warning):** values approaching thresholds
  - **Red (critical):** pH < 6 or > 9, temp > 30, turbidity > 50, TDO < 4
  - (Thresholds can be tuned later)

### 4.10 Polling Refresh

- [ ] Add auto-refresh toggle in the header (on by default)
- [ ] Poll active endpoint every 30 seconds
- [ ] Show "Last updated: X seconds ago" indicator
- [ ] Subtle loading indicator during refresh (don't flash the whole page)
- [ ] **Future:** Replace polling with WebSocket push layer

---

## Phase 5: Production Readiness

### 5.1 Dockerize Full Stack

- [ ] Create `backend/Dockerfile` (Python + FastAPI + gunicorn)
- [ ] Create `frontend/Dockerfile` (Node + Next.js production build)
- [ ] Create root `docker-compose.yml`:
  - `frontend` (port 3000)
  - `backend` (port 8000)
  - `timescaledb` (port 5432, with volume for data persistence)
- [ ] Environment variables via `.env` file (not hardcoded in images)
- [ ] Dev command: `docker compose up` starts everything

### 5.2 Testing

- [ ] Backend API tests: auth flow, robot claim, ownership checks, data queries
- [ ] Backend: SQL query parser — verify it rejects injection attempts (`DROP TABLE`, `; DELETE`, subqueries, `UNION`, etc.)
- [ ] Frontend component tests: data table renders, chart renders, map renders
- [ ] Migration tests: apply all migrations to a fresh DB, verify final schema

### 5.3 API Hardening

- [ ] Rate limiting per user per endpoint
- [ ] Pydantic request models for all endpoints (strict validation)
- [ ] Tighten CORS to production domain only
- [ ] HTTPS enforcement in production
- [ ] Replace deprecated `@app.on_event("startup")` / `@app.on_event("shutdown")` in `main.py` with a `lifespan` context manager (FastAPI >= 0.93 deprecation)

### 5.4 Observability

- [ ] Structured logging (`structlog` or Python `logging` with JSON format)
- [ ] Health check: `GET /health` verifies DB pool is connected
- [ ] Error tracking (Sentry or similar)
- [ ] Log: auth failures, query errors, slow queries (> 1s)

---

## Deferred (out of current scope)

- **unify css variables etc into a css file**
- **MQTT ingestion pipeline** — blocked on sim card module. Will need: MQTT broker (Mosquitto or EMQX), ingestion worker service, robot auto-provisioning with MQTT credentials, `mqtt_username`/`mqtt_password` columns on robots table
- **WebSocket real-time push** — replace polling once ingestion pipeline can trigger push events
- **Robot management UI** — separate ROS platform (confirm scope with Marcus)
- **D3.js visualizations** — evaluate if Recharts is insufficient before adding a second charting library
- **User roles / admin panel** — not needed until multi-organization support
- **API versioning** (`/api/v1/`) — add when breaking API changes become necessary
- **Connection pooling (PgBouncer)** — add when concurrent user count exceeds asyncpg pool limits
