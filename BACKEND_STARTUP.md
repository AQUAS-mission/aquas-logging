# 🚀 Starting the AQUAS Backend - Step by Step

## Prerequisites

Make sure you have:
- Python 3.10+ installed
- Access to a PostgreSQL/TimescaleDB database
- The virtual environment created with dependencies

---

## Quick Start (Copy & Paste)

### Terminal 1: Start the Backend

```powershell
# Navigate to backend directory
cd backend

# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Start the server
python run.py
```

**Expected output:**
```
ℹ️  Using default DATABASE_URL: postgresql://postgres:postgres@localhost:5432/aquas

============================================================
🚀 Starting AQUAS Logging API
============================================================
📍 Backend: http://127.0.0.1:8000
📚 Docs: http://127.0.0.1:8000/docs
🏥 Health: http://127.0.0.1:8000/health
============================================================

INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started server process [12345]
INFO:     Application startup complete
```

### Terminal 2: Test the Backend

```powershell
# Test health endpoint
Invoke-RestMethod http://127.0.0.1:8000/health
```

**Expected output:**
```
status
------
ok
```

✅ **Backend is running!**

---

## Detailed Setup

### Step 1: Install Dependencies (First Time Only)

```powershell
cd backend

# Create virtual environment
python -m venv .venv

# Activate it
.\.venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt
```

### Step 2: Set Database Connection (Optional)

By default, the backend uses:
```
postgresql://postgres:postgres@localhost:5432/aquas
```

To use a different database:

```powershell
# Set environment variable
$env:DATABASE_URL = "postgresql://user:password@host:5432/dbname"

# Then start the server
python run.py
```

### Step 3: Start the Server

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python run.py
```

---

## Alternative: Using Uvicorn Directly

If `python run.py` doesn't work, use uvicorn directly:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn fastapi:app --host 0.0.0.0 --port 8000 --reload
```

---

## Troubleshooting

### Error: "ModuleNotFoundError: No module named 'fastapi'"

**Cause**: Dependencies not installed or venv not activated

**Fix**:
```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Error: "connection refused" or "Unable to connect"

**Cause**: Database server not running

**Fix**: Start your database first

```powershell
# If using local PostgreSQL
net start postgresql-x64-15

# Or if using Docker
docker start aquas-postgres

# Then start the backend
python run.py
```

### Error: "authentication failed" when connecting to database

**Cause**: Wrong DATABASE_URL credentials

**Fix**:
```powershell
# Check your credentials
$env:DATABASE_URL

# Update if needed
$env:DATABASE_URL = "postgresql://correctuser:correctpassword@localhost:5432/aquas"

# Restart server
python run.py
```

### Port 8000 already in use

**Cause**: Backend already running or another process using the port

**Fix**:
```powershell
# Kill process on port 8000
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Or use a different port
uvicorn fastapi:app --host 0.0.0.0 --port 8001 --reload
```

---

## Verification Steps

Once the backend is running, verify it's working:

```powershell
# 1. Health check
Invoke-RestMethod http://127.0.0.1:8000/health

# 2. Check API docs (open in browser)
start http://127.0.0.1:8000/docs

# 3. Try a query (with test token)
$headers = @{ "Authorization" = "Bearer test_token" }
Invoke-RestMethod `
  -Uri "http://127.0.0.1:8000/query/metric?metric=ph&hours=24" `
  -Headers $headers
```

---

## Full Example: Fresh Start

```powershell
# From project root
cd backend

# Setup
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Configure (if needed)
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/aquas"

# Start
python run.py

# In another terminal, test:
Invoke-RestMethod http://127.0.0.1:8000/health
```

---

## Running in Background

If you want to run the backend in the background (not in foreground terminal):

```powershell
# Start in background job
$job = Start-Job -ScriptBlock {
  cd 'C:\Users\abhin\OneDrive\Desktop\AQUAS Data Dashboard\aquas-logging\backend'
  .\.venv\Scripts\Activate.ps1
  python run.py
}

# Check status
Get-Job

# Stop when done
Stop-Job -Job $job
```

---

## Next Steps

Once backend is running:

1. **Insert sample data**:
   ```powershell
   cd backend
   .\.venv\Scripts\Activate.ps1
   python insert_sample_data.py
   ```

2. **Start frontend** (in another terminal):
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

3. **Open dashboard**: `http://localhost:3000`

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `python run.py` | Start backend with auto-reload |
| `uvicorn fastapi:app --host 0.0.0.0 --port 8000 --reload` | Start backend (alternative) |
| `Invoke-RestMethod http://127.0.0.1:8000/health` | Test if backend is running |
| `start http://127.0.0.1:8000/docs` | Open interactive API docs |
| `.\.venv\Scripts\Activate.ps1` | Activate Python virtual environment |
| `pip install -r requirements.txt` | Install dependencies |

---

**Backend should now be running! 🚀**
