# aquas-logging
Logging System for Telemetry and Robot Logs


Schema

Each entry / data point needs a 
- datetime, 
- longitude/latitude, 
- temperature, 
- turbidity (NTD), 
- EC, 
- TDO. 

## Backend API (FastAPI + Postgres)
1) Environment variables (override as needed):
```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=aquas
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

2) Install and run:
```
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn fastapi:app --reload --host 0.0.0.0 --port 8000
```

3) The frontend sends which view was clicked and any params to the `/views/query` endpoint. Views are whitelisted in `backend/fastapi.py` under `VIEW_QUERIES`; update the SQL there to match your schema. Example request:
```
curl -X POST http://localhost:8000/views/query \
  -H "Content-Type: application/json" \
  -d '{"view":"overview","params":{"limit":50}}'
```

The endpoint uses a single async connection pool (asyncpg), runs the SQL tied to the view ID, and returns the rows for the frontend to render.
