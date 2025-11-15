# Water Quality Metrics Dashboard - Setup & Implementation Guide

## What Was Implemented

You now have a beautiful, fully-functional interactive metrics dashboard with tabs for different water quality measurements. Here's what changed:

### Backend Changes

**File: `backend/fastapi.py`**
- Added new endpoint: `GET /query/metric`
- This endpoint filters telemetry data by metric type (pH, temperature, etc.)
- Returns data sorted by time, with optional device filtering and time range selection

**File: `backend/db.py`**
- Added `query_telemetry_by_metric()` function
- Queries database for a specific metric within a time window (default: 24 hours)
- Returns timestamp and value pairs optimized for charting

### Frontend Changes

**File: `frontend/components/chart-area-interactive.tsx`**
- Completely redesigned with a professional tab-based interface
- Shows 5 metrics: pH, Temperature, Dissolved Oxygen, Electrical Conductivity, Turbidity
- Each metric has its own color-coded visualization
- Features:
  - Time range selector (24h, 7d, 30d)
  - Real-time data fetching from backend
  - Live statistics (Latest, Average, Min, Max values)
  - Beautiful gradient area charts
  - Responsive design (mobile & desktop)
  - Loading states and error handling
  - Custom tooltips showing exact values and timestamps

**File: `frontend/hooks/useTelemetryData.ts`**
- New custom React hook for fetching metric data
- Handles loading, error, and success states
- Automatically refetches when metric or time range changes
- Reads `NEXT_PUBLIC_API_URL` from environment
- Includes auth token from localStorage

**File: `frontend/.env`**
- Added `NEXT_PUBLIC_API_URL` so the frontend can reach the backend

---

## How the Dashboard Works

### User Experience

1. **Default View**: Opens with pH metric selected
2. **Tab Navigation**: Click any tab at the top to switch metrics
3. **Time Range**: Use the dropdown to view last 24 hours, 7 days, or 30 days
4. **Statistics**: Instantly see latest value, average, minimum, and maximum
5. **Chart**: Smooth area chart with hoverable tooltip showing exact values
6. **Responsive**: Works beautifully on mobile and desktop

### Data Flow

```
Frontend Chart Component
    ↓
useTelemetryData() hook (reads metric name + time range)
    ↓
HTTP GET /query/metric?metric=ph&hours=24
    ↓
Backend fastapi.py (/query/metric endpoint)
    ↓
Backend db.py (query_telemetry_by_metric function)
    ↓
PostgreSQL/TimescaleDB (telemetry table)
    ↓
Returns JSON: { count, metric, rows: [ {timestamp, value, device_id}, ... ] }
    ↓
Frontend processes data and renders chart
```

---

## Running the Dashboard

### Prerequisites

- Backend API running (FastAPI on port 8000)
- Frontend running (Next.js on port 3000)
- PostgreSQL/TimescaleDB with telemetry data

**🚨 Got a "Failed to Fetch" error?** See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for quick fixes!

### Step 1: Start the Backend

```powershell
# From backend directory
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Set your database connection
$env:DATABASE_URL = "postgresql://user:password@localhost:5432/aquas"

# Start the server
uvicorn fastapi:app --host 0.0.0.0 --port 8000 --reload
```

### Step 2: Insert Sample Data (Optional)

If you have mock data in `frontend/mocks/sensor-data.json`, you can bulk-insert it:

```powershell
# Create a Python script to ingest the mock data
# Then call the backend's /ingest/telemetry endpoint

$token = "test_token"
$data = Get-Content frontend/mocks/sensor-data.json | ConvertFrom-Json

foreach ($record in $data) {
    $payload = @{
        device_id = "sensor-1"
        metric = "ph"
        value = $record.ph
        ts = (Get-Date -UnixTimeSeconds $record.timestamp -AsUTC).ToString("o")
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "http://localhost:8000/ingest/telemetry" `
        -Method Post `
        -Headers @{ "Authorization" = "Bearer $token"; "Content-Type" = "application/json" } `
        -Body $payload
}
```

### Step 3: Start the Frontend

```powershell
# From frontend directory
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` → Navigate to the page with `<ChartAreaInteractive />` component

---

## Configuration

### .env Variables

**Frontend (`frontend/.env`)**:
```
NEXT_PUBLIC_API_URL=http://localhost:8000    # Backend URL (public, visible to browser)
API_BASE_URL=http://localhost:8000            # Optional: for server-side calls
NEXTAUTH_URL=http://localhost:3000            # NextAuth callback URL
NEXTAUTH_SECRET=your_secret_here              # NextAuth secret
```

**Backend (set via environment or `.env`)**:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/aquas
```

### Metrics Configuration

Edit the `METRICS` object in `chart-area-interactive.tsx` to customize:
- Metric labels and units
- Color schemes
- Normal value ranges
- Min/max thresholds

```typescript
const METRICS = {
  ph: {
    label: "pH",
    unit: "pH",
    color: "#8b5cf6",
    min: 0,
    max: 14,
    normal: { min: 6.5, max: 8.5 },
  },
  // ... more metrics
}
```

---

## Features Included

✅ **Multi-Metric Tabs**: Switch between 5 different water quality metrics  
✅ **Time Range Selection**: View data for 24h, 7d, or 30d  
✅ **Real-time Statistics**: Live min/max/average calculations  
✅ **Smooth Animations**: Interactive area charts with gradients  
✅ **Responsive Design**: Mobile-optimized layout  
✅ **Error Handling**: Shows loading spinners and error messages  
✅ **Database Integration**: Pulls live data from backend API  
✅ **Authentication Ready**: Uses Bearer token from localStorage  
✅ **Beautiful UI**: Color-coded by metric type  

---

## Troubleshooting

### "Unauthorized. Please login." Error

**Issue**: Auth token missing or invalid  
**Fix**: The hook looks for a token in `localStorage.getItem("auth_token")`. Ensure your login flow saves the token.

Temporarily for testing, you can modify `useTelemetryData.ts`:
```typescript
const token = localStorage.getItem("auth_token") || "test_token"
```

### No Data Showing

**Check**:
1. Backend is running: `curl http://localhost:8000/health`
2. Database has data: Query the telemetry table directly
3. API endpoint works: `curl http://localhost:8000/query/metric?metric=ph -H "Authorization: Bearer test"`
4. Time range is correct: Try `24h` first (hours = 24)

### CORS Issues

If you get CORS errors, add this to `backend/fastapi.py`:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Next Steps (Optional Enhancements)

- [ ] Add data export (CSV/PDF)
- [ ] Add anomaly detection alerts
- [ ] Add device selector to filter by specific sensor
- [ ] Add comparison view (compare pH from 2 different time periods)
- [ ] Add historical trend analysis
- [ ] Add predictive alerts for out-of-range values
- [ ] Add real-time streaming with WebSockets

---

## Files Modified

```
backend/
  ├── fastapi.py (added /query/metric endpoint)
  └── db.py (added query_telemetry_by_metric function)

frontend/
  ├── .env (added NEXT_PUBLIC_API_URL)
  ├── components/
  │   └── chart-area-interactive.tsx (complete redesign)
  └── hooks/
      └── useTelemetryData.ts (new custom hook)
```

---

Enjoy your beautiful water quality dashboard! 🌊📊
