# 🔍 AQUAS Dashboard Troubleshooting - "Failed to Fetch" Error

## Quick Answer
**The error usually means: "The dashboard is trying to fetch data from the backend, but either:**
1. **The backend isn't running**
2. **The database is empty (no data to fetch)**
3. **The frontend can't reach the backend URL**

---

## Step-by-Step Diagnosis (PowerShell)

### Step 1: Verify Backend is Running

```powershell
# Check if backend is responding
Invoke-RestMethod http://127.0.0.1:8000/health -ErrorAction Stop
```

**Expected output:**
```
status
------
ok
```

**If it fails**: Start your backend in another PowerShell window:
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn fastapi:app --host 0.0.0.0 --port 8000 --reload
```

---

### Step 2: Check Database Connection

```powershell
# Verify DATABASE_URL is set
$env:DATABASE_URL
```

Should show something like: `postgresql://user:password@localhost:5432/aquas`

**If empty**: Set it:
```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/aquas"
```

---

### Step 3: Check if Database Has Data

```powershell
# Test the query endpoint directly
$headers = @{ "Authorization" = "Bearer test_token" }
$response = Invoke-RestMethod `
  -Uri "http://127.0.0.1:8000/query/metric?metric=ph&hours=24&limit=10" `
  -Headers $headers

Write-Host "Found $($response.count) pH records"
if ($response.count -eq 0) {
  Write-Host "⚠️  Database is EMPTY - you need to insert data!"
} else {
  Write-Host "✓ Data found! Sample:"
  $response.rows[0]
}
```

**If count is 0**: Your database is empty. Go to Step 4.

---

### Step 4: Insert Sample Data

The simplest way is to use the data already in `frontend/mocks/sensor-data.json`.

#### Option A: Use Python Script (Recommended)

```powershell
# From backend directory
cd backend
.\.venv\Scripts\Activate.ps1

# Make sure httpx is installed
pip install httpx

# Run the insert script
python insert_sample_data.py
```

**You should see:**
```
📊 AQUAS Sample Data Inserter
============================================================
✓ Found sensor data file: ...
✓ Loaded 100 records

📤 Inserting data to http://localhost:8000/...
   Using token: test_token
------------------------------------------------------------
   ✓ Inserted 25 records...
   ✓ Inserted 50 records...
   ...
------------------------------------------------------------

✅ Insert Complete!
   Total inserted: 500
   Errors: 0

🎉 Success! Your dashboard should now display data.
   Refresh http://localhost:3000 to see the charts.
```

#### Option B: Manual PowerShell Insert (if Python script fails)

```powershell
# Load sensor data
$sensorData = Get-Content frontend/mocks/sensor-data.json | ConvertFrom-Json
$token = "test_token"
$count = 0

foreach ($record in $sensorData) {
  foreach ($metric in @("ph", "temperature", "dissolved_oxygen", "electrical_conductivity", "turbidity_ntu")) {
    $ts = (Get-Date -UnixTimeSeconds $record.timestamp -AsUTC).ToString("o")
    
    $payload = @{
      device_id = "sensor-1"
      metric = $metric
      value = $record.$metric
      ts = $ts
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "http://localhost:8000/ingest/telemetry" `
      -Method Post `
      -Headers @{ "Authorization" = "Bearer $token"; "Content-Type" = "application/json" } `
      -Body $payload | Out-Null
    
    $count++
    if ($count % 50 -eq 0) { Write-Host "Inserted $count records..." }
  }
}

Write-Host "✓ Inserted $count total records!"
```

---

### Step 5: Check Frontend Environment

```powershell
# Verify .env has the API URL
Get-Content frontend/.env | grep NEXT_PUBLIC_API_URL
```

Should show:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

If missing, add it:
```powershell
Add-Content frontend/.env "`nNEXT_PUBLIC_API_URL=http://localhost:8000"
```

---

### Step 6: Refresh Frontend

```powershell
# In your browser, do a hard refresh:
# Windows/Linux: Ctrl + Shift + R
# Mac: Cmd + Shift + R

# Or clear browser cache and reload http://localhost:3000
```

---

## Complete Checklist

- [ ] Backend running: `uvicorn fastapi:app --host 0.0.0.0 --port 8000 --reload`
- [ ] `http://127.0.0.1:8000/health` returns `{ "status": "ok" }`
- [ ] `$env:DATABASE_URL` is set to your Postgres connection
- [ ] Database telemetry table has rows: `query/metric` endpoint returns count > 0
- [ ] `frontend/.env` has `NEXT_PUBLIC_API_URL=http://localhost:8000`
- [ ] Frontend hard-refreshed (Ctrl+Shift+R)

---

## Detailed Troubleshooting

### "Failed to fetch" but backend is running

**Problem**: CORS error or auth failure

**Fix 1**: Add CORS to backend (`backend/fastapi.py` - top of file after imports):
```python
from fastapi.middleware.cors import CORSMiddleware

# Add this after app = FastAPI(...)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Fix 2**: Check auth token handling in frontend hook

In `frontend/hooks/useTelemetryData.ts`, verify the token:
```typescript
// Temporarily use a test token
const token = "test_token"  // Change from: localStorage.getItem("auth_token") || "test_token"
```

After testing, restore it to use localStorage for production.

### Database Connection Failed

**Error**: `could not translate host name "localhost" to address`

**Cause**: Postgres not running or wrong host

**Fix**:
```powershell
# If using Docker
docker run -d `
  --name aquas-postgres `
  -e POSTGRES_DB=aquas `
  -e POSTGRES_PASSWORD=postgres `
  -p 5432:5432 `
  postgres:15

# Set DATABASE_URL
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/aquas"
```

### 401 Unauthorized Error

**Problem**: Auth token not being sent correctly

**Quick fix for testing**: Disable auth temporarily in `backend/auth.py`:
```python
async def get_current_user(token: str = Depends(oauth2_scheme)):
    # Temporarily disable for testing
    return {"sub": "test-user"}
    
    # Original code below:
    # if not token or token == "":
    #     raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication")
    # return {"sub": "test-user"}
```

---

## Testing Commands (PowerShell)

```powershell
# Test 1: Health check
Invoke-RestMethod http://127.0.0.1:8000/health

# Test 2: Query endpoint with token
$headers = @{ "Authorization" = "Bearer test_token" }
Invoke-RestMethod `
  -Uri "http://127.0.0.1:8000/query/metric?metric=ph&hours=24" `
  -Headers $headers

# Test 3: Insert one test record
$payload = @{
  device_id = "test-device"
  metric = "ph"
  value = 7.0
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:8000/ingest/telemetry" `
  -Method Post `
  -Headers $headers `
  -Body $payload `
  -ContentType "application/json"
```

---

## Summary

| Issue | Solution |
|-------|----------|
| Backend not running | `uvicorn fastapi:app --host 0.0.0.0 --port 8000 --reload` |
| Database is empty | Run `python insert_sample_data.py` or PowerShell insert script |
| CORS errors | Add CORS middleware to `backend/fastapi.py` |
| 401 auth errors | Use test token or disable auth temporarily for testing |
| Wrong API URL | Check `NEXT_PUBLIC_API_URL` in `frontend/.env` |
| Frontend cache issues | Hard refresh browser: `Ctrl+Shift+R` |

---

**Once data is inserted, your dashboard should work perfectly! 🎉**
