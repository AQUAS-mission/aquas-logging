# aquas-logging
Logging System for Telemetry and Robot Logs

## Schema

Each entry / data point needs a 
- datetime, 
- longitude/latitude, 
- temperature, 
- turbidity (NTU), 
- EC (electrical conductivity), 
- TDO (total dissolved oxygen).

## Local PostgreSQL Setup (Testing Only)

### 1) Install TimescaleDB with Docker

Docker will automatically pull the image if needed:
```bash
docker run -d --name timescaledb \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  timescale/timescaledb-ha:pg17-all
```

### 2) Enable TimescaleDB Extension

Connect to PostgreSQL:
```bash
docker exec -it timescaledb psql -U postgres
```

Enable TimescaleDB:
```sql
CREATE DATABASE aquas;
\c aquas
CREATE EXTENSION IF NOT EXISTS timescaledb;
\q
```

### 3) Apply the Schema
```sql
CREATE SCHEMA waterq;

ALTER SCHEMA waterq OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE waterq.measurements (
    "time" timestamp with time zone NOT NULL,
    longitude double precision NOT NULL,
    latitude double precision NOT NULL,
    temperature_c double precision,
    turbidity_ntu double precision,
    ec_us_cm double precision,
    tdo_mg_l double precision,
    ph double precision,
    CONSTRAINT chk_ec CHECK (((ec_us_cm IS NULL) OR (ec_us_cm >= (0)::double precision))),
    CONSTRAINT chk_lat CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
    CONSTRAINT chk_lon CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))),
    CONSTRAINT chk_tdo CHECK (((tdo_mg_l IS NULL) OR (tdo_mg_l >= (0)::double precision))),
    CONSTRAINT chk_temp CHECK (((temperature_c IS NULL) OR ((temperature_c >= ('-5'::integer)::double precision) AND (temperature_c <= (80)::double precision)))),
    CONSTRAINT chk_turb CHECK (((turbidity_ntu IS NULL) OR (turbidity_ntu >= (0)::double precision))),
    CONSTRAINT measurements_ph_check CHECK (((ph >= (0)::double precision) AND (ph <= (14)::double precision)))
);

ALTER TABLE waterq.measurements OWNER TO postgres;

ALTER TABLE ONLY waterq.measurements
    ADD CONSTRAINT measurements_pk PRIMARY KEY (longitude, latitude, "time");

CREATE INDEX measurements_longitude_latitude_time_idx ON waterq.measurements USING btree (longitude, latitude, "time" DESC);

CREATE INDEX measurements_time_idx ON waterq.measurements USING btree ("time" DESC);

-- Convert to hypertable
SELECT create_hypertable('waterq.measurements', 'time', 
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);
```

### 4) Environment Variables

Create a `.env` file or export these variables:
```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

### 5) Load Fake Data (Optional)
```bash
cd backend
source .venv/bin/activate
export $(cat .env | xargs)
python load_fake_data.py --weeks 4 --interval-mins 15
```

This generates ~4 weeks of synthetic sensor data at 15-minute intervals.

## Backend API (FastAPI + Postgres)

### 1) Install and Run
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export $(cat .env | xargs)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2) API Usage

The frontend sends which view was clicked and any params to the `/views/query` endpoint. Views are whitelisted in `backend/main.py` under `VIEW_QUERIES`; update the SQL there to match your schema.

Example request:
```bash
curl -X POST http://localhost:8000/views/query \
  -H "Content-Type: application/json" \
  -d '{"view":"overview","params":{"limit":50}}'
```

The endpoint uses a single async connection pool (asyncpg), runs the SQL tied to the view ID, and returns the rows for the frontend to render.

## One-command local startup (Windows, local PostgreSQL)

If you already have PostgreSQL installed locally (non-Docker), you can start everything with one command from the repo root:

```powershell
& ".\.venv\Scripts\Activate.ps1"
python .\run.py
```

What `run.py` does:
- Runs a PostgreSQL connectivity check using `psql.exe` (same approach as your manual command).
- Starts backend (`uvicorn`) and frontend (`npm run dev`) together in one terminal.
- Streams prefixed logs and stops both processes on `Ctrl+C`.

Defaults used by `run.py`:
- `psql` path: `C:\Program Files\PostgreSQL\18\bin\psql.exe`
- host: `127.0.0.1`
- user: `postgres`
- db: `postgres`
- password: `postgres`

You can override values, for example:

```powershell
python .\run.py --pg-password postgres --backend-port 8000 --frontend-port 3000
```