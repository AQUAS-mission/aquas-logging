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
- [x] Create index on `user_id`
- [x] Create index on `serial_number`
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

- [x] Require authentication (JWT via `get_current_user`)
- [x] Accept body: `{ "serial_number": string }`
- [x] Look up robot by `serial_number`
  - `404` if serial number not found in DB
  - `409` if robot's `user_id` is already set (claimed by someone)
- [x] Set `user_id` to the logged-in user's ID
- [x] Return `200` with robot details (`robot_id`, `name`, `serial_number`)

### 2.7 GET /robots/me

**Blocked by:** Phase 2.3 (auth middleware)

- [x] Require authentication
- [x] Query `waterq.robots WHERE user_id = $1`
- [x] Return: `[{ robot_id, name, serial_number, is_active, last_seen_at, last_latitude, last_longitude }]`

### 2.8 GET /robots/{robot_id}/data

**Blocked by:** Phase 1.4 (robot_id on measurements), Phase 2.3 (auth middleware)

- [x] Require authentication
- [x] Ownership check: verify the robot's `user_id` matches logged-in user → `403` if not
- [x] Query parameters:
  - `hours` (int, default 24) — return last N hours of data
  - `start_time` (ISO 8601, optional) — explicit start of range
  - `end_time` (ISO 8601, optional) — explicit end of range
- [x] Return: `{ robot_id, rows: [{ timestamp, longitude, latitude, ph, temperature, dissolved_oxygen, electrical_conductivity, turbidity_ntu }] }`

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

- [x] Add authentication (`get_current_user` dependency)
- [x] Scope all existing view queries by injecting `robot_id IN (SELECT robot_id FROM waterq.robots WHERE user_id = $1)`

---

## Phase 3: Frontend Auth & Registration

### 3.1 Fix JWT Passing to Backend

**Current bug:** `session.user.accessToken` is set to `JSON.stringify(token)` (the decoded token object). The backend needs the actual encoded JWT string.

- [x] Update NextAuth config to pass the raw encoded JWT to the session
- [x] Update all frontend API calls to include `Authorization: Bearer <jwt>` header
- [x] Verify backend `auth.py` successfully decodes the token

### 3.2 Add Google OAuth Provider

- [x] Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`
- [x] Update `[...nextauth]/route.ts`:
  - Add `GoogleProvider` alongside `CredentialsProvider`
  - Ensure JWT callback handles both provider types (Google user has email from profile, credentials user has email from form)

### 3.3 Update CredentialsProvider

- [x] Change `authorize` callback to call backend `POST /auth/verify` with email + password
- [x] Remove hardcoded `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars
- [x] Return user object from backend response (`id`, `email`, `display_name`)

### 3.4 Create Registration Page

- [x] Create `/register` route and page
- [x] Form fields: email, password, confirm password, display name (optional)
- [x] Client-side validation: email format, password min 8 chars, passwords match
- [x] On submit: call backend `POST /auth/register`
  - Success → redirect to `/login` with success message
  - `409` → show "email already taken" error
- [x] Link: "Already have an account? Sign in"

### 3.5 Update Login Page

- [x] Change username field to email field
- [x] Add "Sign in with Google" button
- [x] Add "Don't have an account? Register" link
- [x] Style consistently with registration page

---

## Phase 4: Dashboard Features

### 4.1 Robot Selector & Multi-Robot View

**Blocked by:** Phase 2.7 (GET /robots/me), Phase 2.8 (GET /robots/{robot_id}/data)

- [x] Fetch user's robots from `GET /robots/me` on mount
- [x] Add robot selector dropdown (sidebar or header) — default to first robot
- [x] "Compare" mode toggle:
  - Switches dropdown to multi-select
  - Each robot gets a distinct color across all visualizations
- [x] All components (cards, chart, table) refetch when selected robot changes
- [x] Switch API calls from `/views/query` to `GET /robots/{robot_id}/data`

### 4.2 Robot Claim Page

**Blocked by:** Phase 2.6 (POST /robots/claim)

- [x] Create `/robots/claim` route (or modal accessible from sidebar)
- [x] Form: serial number input
- [x] On submit: call `POST /robots/claim`
  - `200` → show robot name, refresh robot list, redirect to dashboard
  - `404` → "Robot not found — check the serial number"
  - `409` → "This robot is already claimed"
- [x] Show "Claim a Robot" prompt in sidebar when user has 0 robots

### 4.3 Form-Based Filter Panel

- [x] Add collapsible filter panel above the data table
- [x] Controls:
  - Date range picker (start date / end date)
  - Metric range sliders: pH (0–14), temperature (-5–80), turbidity (0–100+), EC (0–2000+), TDO (0–20+)
  - Robot selector (when in multi-robot compare mode)
- [x] "Apply Filters" sends request to `GET /robots/{robot_id}/data` with `start_time` / `end_time`
- [x] Metric sliders filter client-side from the fetched data (or pass to query endpoint)
- [x] "Reset" clears all filters
- [x] Persist filters in URL query params for shareable links

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

- [x] Install `react-map-gl` + `maplibre-gl` (no API key needed)
- [x] Add map component to dashboard layout (below chart, above table)
- [x] Plot a dot at each measurement's `(longitude, latitude)`
- [x] Color dots by the currently selected metric (gradient: green → yellow → red based on value)
- [x] Tooltip on hover: timestamp + all metric values for that reading


### 4.6 Geospatial Map — Path/Track

**Blocked by:** Phase 4.5 (map component exists)

- [x] Draw a line connecting measurement points in chronological order
- [x] Line color: gradient from faded to solid (old → recent)
- [x] Single-robot view: one path
- [x] Multi-robot compare mode: each robot gets a distinct colored path

### 4.7 Geospatial Map — Heatmap Layer

**Blocked by:** Phase 4.5

- [x] Add heatmap toggle button on the map
- [x] Intensity driven by the currently selected metric (e.g., turbidity hotspots)
- [x] Dropdown to select which metric drives the heatmap
- [x] Answers: "where are the worst readings for X metric?"

### 4.9 Update Section Cards

- [x] Refactor to use `GET /robots/{robot_id}/data` instead of `/views/query`
- [x] In multi-robot compare mode: show per-robot breakdown or combined averages (toggle)
- [x] Color-coded status indicators:
  - **Green (normal):** pH 6.5–8.5, temp 5–25, turbidity < 10, TDO > 6
  - **Yellow (warning):** values approaching thresholds
  - **Red (critical):** pH < 6 or > 9, temp > 30, turbidity > 50, TDO < 4
  - (Thresholds can be tuned later)

### 4.10 Polling Refresh

- [x] Add auto-refresh toggle in the header (on by default)
- [x] Poll active endpoint every 30 seconds
- [x] Show "Last updated: X seconds ago" indicator
- [x] Subtle loading indicator during refresh (don't flash the whole page)
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

## Phase 6: MQTT Integration & Arduino Firmaware

**Architecture recap:**
```
Arduino Uno + SIM7000A
  └─ publishes JSON over LTE-M cellular
       └─► Mosquitto broker (Docker, port 1883 now / 8883 TLS later)
              topic: aquas/v1/robots/{serial_number}/telemetry
              lwt:   aquas/v1/robots/{serial_number}/status → "offline"
              auth:  username=serial_number, password=device_token
                └─► MQTT Ingestion Worker (Python, separate Docker service)
                       subscribes: aquas/v1/robots/+/telemetry
                                   aquas/v1/robots/+/status
                       └─► TimescaleDB  ──►  FastAPI  ──►  Next.js dashboard
```

**Auth model:** Each robot has a `device_token` — a long random secret baked into
firmware at provisioning time. The robot authenticates to Mosquitto with
`username=serial_number` / `password=device_token`. This is completely separate
from user account auth (NextAuth + JWT), which is only for the dashboard.

**Topic versioning:** All topics are prefixed `aquas/v1/` so the schema can evolve
(payload fields added/removed, new topic types) without breaking deployed robots
still on the old firmware. Bump to `aquas/v2/` when making a breaking change.

**Last Will & Testament (LWT):** Configured on the Arduino at connect time. If the
robot drops off the network unexpectedly (no clean disconnect), the broker automatically
publishes `"offline"` to `aquas/v1/robots/{serial}/status`. The ingestion worker
subscribes to status topics and updates `waterq.robots.is_active` accordingly.
The dashboard can then show a live online/offline badge per robot.

---

### 6.1 DB Migration — `device_token` column

**File:** `backend/migrations/005_device_token.sql`

- [ ] `CREATE EXTENSION IF NOT EXISTS pgcrypto;` — needed for `gen_random_bytes()`
- [ ] `ALTER TABLE waterq.robots ADD COLUMN IF NOT EXISTS device_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex')`
  - The DEFAULT means existing rows get a token automatically on migration
- [ ] Create unique index on `device_token`
- [ ] Update `load_fake_data.py` — test robots should have a known hardcoded token for easy dev/testing

**Docs:**
- pgcrypto extension: https://www.postgresql.org/docs/current/pgcrypto.html
- `gen_random_bytes`: https://www.postgresql.org/docs/current/pgcrypto.html#PGCRYPTO-RANDOM-FUNCTIONS
- `ALTER TABLE ADD COLUMN`: https://www.postgresql.org/docs/current/sql-altertable.html

---

### 6.2 Mosquitto Broker — Config & Docker

**What Mosquitto is:** An open-source MQTT message broker. Robots publish sensor
readings to it; the ingestion worker subscribes and drains them into the DB.
It runs independently of FastAPI — broker messages persist across app restarts.

**Files to create:**
```
mosquitto/
  mosquitto.conf      ← broker configuration
  acl.conf            ← per-robot topic restrictions
  passwd              ← hashed credentials file, gitignored
```

**`mosquitto.conf` settings to configure:**
- `listener 1883` — plain MQTT (TLS on 8883 deferred, see notes below)
- `allow_anonymous false` — every connection must have credentials
- `password_file /mosquitto/config/passwd`
- `acl_file /mosquitto/config/acl.conf`
- `persistence true` + `persistence_location /mosquitto/data/` — survive restarts
- `log_dest stdout` — Docker-friendly logging

**`acl.conf` pattern — one block per robot:**
```
# each robot may only WRITE to its own versioned topics
user SN-001
topic write aquas/v1/robots/SN-001/telemetry
topic write aquas/v1/robots/SN-001/status

user SN-002
topic write aquas/v1/robots/SN-002/telemetry
topic write aquas/v1/robots/SN-002/status

# ingestion worker reads all robot topics across all versions
user mqtt_ingestion_worker
topic read aquas/+/robots/#
```

**Note on ACL + LWT:** The LWT message is published by the *broker* on the robot's behalf,
but the broker publishes it using the robot's credentials. This means the robot's ACL must
include `write` on its own status topic, or the LWT will be silently blocked.

**Generating the `passwd` file:**
Use the `mosquitto_passwd` CLI tool (ships with Mosquitto). Run it inside a
temporary Mosquitto container — you do NOT need Mosquitto installed locally:
```bash
docker run --rm -v $(pwd)/mosquitto:/mosquitto/config eclipse-mosquitto:2 \
  mosquitto_passwd -b /mosquitto/config/passwd SN-001 <device_token>
```

**Docs:**
- Mosquitto config full reference: https://mosquitto.org/man/mosquitto-conf-5.html
- mosquitto_passwd tool: https://mosquitto.org/man/mosquitto_passwd-1.html
- ACL file format (search "acl_file"): https://mosquitto.org/man/mosquitto-conf-5.html
- Eclipse Mosquitto Docker image: https://hub.docker.com/_/eclipse-mosquitto
- MQTT topic best practices / wildcard syntax: https://www.hivemq.com/blog/mqtt-essentials-part-5-mqtt-topics-best-practices/

---

### 6.3 Robot Provisioning Script

**File:** `backend/provision_robot.py` — run by admin/hardware team, not part of FastAPI

This is how new robots get added to the system before users claim them.

**What it does:**
1. Accepts `--name` and `--serial` as CLI args
2. Inserts a row into `waterq.robots` (no `user_id` — unclaimed)
3. Reads the auto-generated `device_token` back from the DB
4. Appends entry to `mosquitto/passwd` via subprocess `mosquitto_passwd`
5. Appends the robot's ACL block to `mosquitto/acl.conf`
6. Sends `SIGHUP` to the Mosquitto container to reload config without restart (`docker kill --signal=SIGHUP mosquitto`)
7. Prints the `device_token` to stdout — this value gets pasted into `config.h` and flashed onto the Arduino

**Usage:**
```bash
python provision_robot.py --name "Robot Alpha" --serial "SN-001"
# Output:
# Robot created: SN-001
# device_token:  a3f9c2d1e4b7...   <-- paste into firmware config.h
# Mosquitto credentials updated.
```
**Docs:**
- argparse (CLI args): https://docs.python.org/3/library/argparse.html
- subprocess: https://docs.python.org/3/library/subprocess.html
- `docker kill --signal`: https://docs.docker.com/reference/cli/docker/container/kill/

---

### 6.4 MQTT Ingestion Worker

**File:** `backend/mqtt_ingestion.py` — runs as its own Docker service

An async Python process that bridges Mosquitto → TimescaleDB.

**Logic:**
1. Connect to Mosquitto with ingestion worker credentials
2. Subscribe to `aquas/v1/robots/+/telemetry` and `aquas/v1/robots/+/status`
3. On **telemetry** message:
   - Parse JSON payload
   - Validate sensor value ranges (match the DB CHECK constraints in `000_init_schema.sql`)
   - Look up `robot_id` from `serial_number` (`SELECT robot_id FROM waterq.robots WHERE serial_number = $1`)
   - `INSERT INTO waterq.measurements (time, robot_id, longitude, latitude, temperature_c, turbidity_ntu, ec_us_cm, tdo_mg_l, ph)`
   - `UPDATE waterq.robots SET last_seen_at = NOW(), last_latitude = $1, last_longitude = $2, is_active = TRUE WHERE robot_id = $3`
4. On **status** message (`"online"` or `"offline"`):
   - Extract serial number from topic path (`aquas/v1/robots/{serial}/status`)
   - `UPDATE waterq.robots SET is_active = ($1 = 'online') WHERE serial_number = $2`
   - This powers the online/offline badge on the dashboard
5. Auto-reconnect if broker drops (aiomqtt handles this with an async `for` loop pattern)

**Expected JSON payload from Arduino:**
```json
{
  "serial": "SN-001",
  "ts":     "2026-03-07T12:00:00Z",
  "lat":    40.7484,
  "lon":    -73.9857,
  "temp":   22.5,
  "turb":   3.2,
  "ec":     450.0,
  "tdo":    8.1,
  "ph":     7.2
}
```

**Docs:**
- aiomqtt getting started: https://aiomqtt.bo3hm.de/
- aiomqtt reconnection pattern: https://aiomqtt.bo3hm.de/reconnection.html
- aiomqtt filtered messages (subscribe to wildcard): https://aiomqtt.bo3hm.de/filtering-messages.html

---

### 6.5 Arduino Firmware — SIM7000A on Uno

**Hardware:** Arduino Uno + SIM7000A soldered directly.

**Critical Uno constraints:**
- **2KB SRAM only** — must use `F()` macro on every string literal or you'll silently
  run out of memory and get random crashes/hangs. No exceptions.
- SIM7000A must use **SoftwareSerial** — Uno's only HW serial (pins 0/1) is occupied by USB/monitor
- SoftwareSerial is reliable at **9600 baud** on Uno — do not go higher or you'll drop bytes
- SIM7000A has **built-in GNSS** — no separate GPS module needed

**Files to create:**
```
firmware/
  aquas_robot/
    config.h           ← gitignored, one file per physical robot
    aquas_robot.ino    ← main sketch
    README.md          ← wiring, library install, flashing instructions
```

**`config.h` template:**
```cpp
// Carrier APN — examples: "hologram" (Hologram), "iot.1nce.net" (1NCE)
// Find yours at: https://www.apnsettings.org/
#define CELLULAR_APN    "your_apn_here"

// MQTT broker — must be reachable over public internet via LTE
// For dev: use ngrok TCP tunnel or deploy broker to a VPS
#define MQTT_BROKER     "your.broker.ip.or.hostname"
#define MQTT_PORT       1883

// Per-device identity — output of provision_robot.py
#define DEVICE_SERIAL   "SN-001"
#define DEVICE_TOKEN    "a3f9c2d1e4b7..."

// How often to publish sensor readings (milliseconds)
#define PUBLISH_INTERVAL_MS 30000UL

// SoftwareSerial pins — adjust to match your wiring
#define SIM_TX_PIN 7   // Arduino TX → SIM7000A RX
#define SIM_RX_PIN 8   // Arduino RX ← SIM7000A TX
#define SIM_RST_PIN 6  // Optional reset pin
```

**Required Arduino libraries** (all available in Library Manager, `Sketch → Include Library → Manage Libraries`):

| `TinyGSM` | Volodymyr Shymanskyy | AT-command driver for SIM7000A |
| `PubSubClient` | Nick O'Leary | MQTT client over TinyGSM |
| `ArduinoJson` | Benoit Blanchon | Build JSON payload |
| `SoftwareSerial` | Arduino | Talk to SIM7000A (built-in, no install needed) |

**SRAM-saving TinyGSM config** — add these `#define`s BEFORE `#include <TinyGsmClient.h>`:
```cpp
#define TINY_GSM_MODEM_SIM7000
#define TINY_GSM_RX_BUFFER 64   // shrink from default 1024 — saves ~960 bytes SRAM
```

**Last Will & Testament notes:**
- `setWill()` must be called before `connect()` — the broker stores it at connect time
- Use `retain=true` so the broker holds the last status message; new subscribers (dashboard page loads) immediately get the current state without waiting for the next publish
- In `reconnect()`, re-publish `"online"` after a successful reconnect so the retained status stays accurate
- PubSubClient `setWill` signature: `mqtt.setWill(topic, payload, retained, qos)`
- Docs: https://pubsubclient.knolleary.net/api#setwill

**SIM7000A GNSS notes:**
- Cold start fix can take 30–90 seconds outdoors — must handle the "no fix yet" case
  gracefully (skip publish or publish with lat=0/lon=0 flagged)
- TinyGSM `getGPS()` returns `false` if no fix — check the return value
- GNSS power: `modem.enableGPS()` in setup, `modem.disableGPS()` if you want to save
  power between readings

**SRAM free memory helper — paste this to debug crashes:**
```cpp
int freeMemory() {
  extern int __heap_start, *__brkval;
  int v;
  return (int)&v - (__brkval == 0 ? (int)&__heap_start : (int)__brkval);
}
// Call Serial.println(freeMemory()) in setup() — should be > 500 bytes minimum
```

**Docs:**
- TinyGSM README + SIM7000 notes: https://github.com/vshymanskyy/TinyGSM
- TinyGSM SIM7000 MQTT example: https://github.com/vshymanskyy/TinyGSM/blob/master/examples/MqttClient/MqttClient.ino
- PubSubClient API reference: https://pubsubclient.knolleary.net/api
- ArduinoJson v7 code generator (paste your payload, get exact code): https://arduinojson.org/v7/assistant/
- SoftwareSerial: https://docs.arduino.cc/learn/built-in-libraries/software-serial/
- Botletics SIM7000 shield repo (great reference for wiring + AT commands, even without their shield): https://github.com/botletics/SIM7000-LTE-Shield
- SIMCOM SIM7000A AT Command Manual: search "SIM7000 Series_AT Command Manual" on https://simcom.ee/documents/ — covers GNSS (`AT+CGNSINF`), SSL, MQTT AT commands
- APN lookup by carrier: https://www.apnsettings.org/

---

### 6.6 Docker Compose — Full Stack

**File:** `docker-compose.yml` at project root

Brings up the entire stack with one command: `docker compose up`

**Services:**
- `timescaledb` — existing DB, moved from manual `docker run`
- `backend` — FastAPI + uvicorn
- `frontend` — Next.js production build
- `mosquitto` — MQTT broker
- `mqtt_ingestion` — ingestion worker

**Docs:**
- Docker Compose reference: https://docs.docker.com/compose/compose-file/
- TimescaleDB Docker image: https://hub.docker.com/r/timescale/timescaledb
- Compose `depends_on` with health checks: https://docs.docker.com/compose/how-tos/startup-order/

---

## Deferred (out of current scope)

- **unify css variables etc into a css file**
- **TLS on MQTT (port 8883)** — add after plain MQTT is working end-to-end.
  Requires: Mosquitto TLS config (`cafile`, `certfile`, `keyfile`), uploading root CA
  cert to SIM7000A flash via `AT+CSSLCFG`, updating TinyGSM to use SSL client.
  Docs when ready: https://mosquitto.org/man/mosquitto-tls-7.html
- **WebSocket real-time push** — replace polling once ingestion pipeline is live
- **Robot management UI** — separate ROS platform (confirm scope with Marcus)
- **D3.js visualizations** — evaluate if Recharts is insufficient before adding a second charting library
- **User roles / admin panel** — not needed until multi-organization support
- **API versioning** (`/api/v1/`) — add when breaking API changes become necessary
- **Connection pooling (PgBouncer)** — add when concurrent user count exceeds asyncpg pool limits
