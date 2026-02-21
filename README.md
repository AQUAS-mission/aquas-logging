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

### 3) Apply Migrations

Run all migration files in order:
```bash
docker exec -i timescaledb psql -U postgres -d aquas -f - < backend/migrations/000_init_schema.sql
docker exec -i timescaledb psql -U postgres -d aquas -f - < backend/migrations/001_users.sql
docker exec -i timescaledb psql -U postgres -d aquas -f - < backend/migrations/001_robots.sql
docker exec -i timescaledb psql -U postgres -d aquas -f - < backend/migrations/002_measurements_robot_id.sql
docker exec -i timescaledb psql -U postgres -d aquas -f - < backend/migrations/003_continous_aggregations.sql
docker exec -i timescaledb psql -U postgres -d aquas -f - < backend/migrations/004_compression_retention.sql
```

Migrations are idempotent — safe to re-run.

### 4) Environment Variables

Create a `.env` file or export these variables:
```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=aquas
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