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

### 1) Install PostgreSQL

**macOS (Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 2) Create Database and Schema

Connect to PostgreSQL and run:
```bash
psql -U postgres
```

Then execute:
```sql
CREATE DATABASE aquas;
\c aquas
CREATE SCHEMA waterq;
CREATE TABLE waterq.measurements (
    time TIMESTAMPTZ NOT NULL,
    longitude DOUBLE PRECISION,
    latitude DOUBLE PRECISION,
    temperature_c DOUBLE PRECISION,
    turbidity_ntu DOUBLE PRECISION,
    ec_us_cm DOUBLE PRECISION,
    tdo_mg_l DOUBLE PRECISION,
    ph DOUBLE PRECISION
);
\q
```

### 3) Load Fake Data (Optional)

```bash
cd backend
source .venv/bin/activate
export $(cat .env | xargs)
python load_fake_data.py --weeks 4 --interval-mins 15
```

This generates ~4 weeks of synthetic sensor data at 15-minute intervals.

## Backend API (FastAPI + Postgres)

### 1) Environment Variables

Create a `.env` file in `backend/` or export these variables:
```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=aquas
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

### 2) Install and Run

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export $(cat .env | xargs)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3) API Usage

The frontend sends which view was clicked and any params to the `/views/query` endpoint. Views are whitelisted in `backend/main.py` under `VIEW_QUERIES`; update the SQL there to match your schema.

Example request:
```bash
curl -X POST http://localhost:8000/views/query \
  -H "Content-Type: application/json" \
  -d '{"view":"overview","params":{"limit":50}}'
```

The endpoint uses a single async connection pool (asyncpg), runs the SQL tied to the view ID, and returns the rows for the frontend to render.
