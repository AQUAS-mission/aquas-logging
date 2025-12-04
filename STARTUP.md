# AQUAS Dashboard - Quick Start Guide

## One-Command Setup

To start the entire AQUAS Dashboard stack (Backend & Frontend) with one command:

```bash
./startup.sh
```

This script will automatically:
- ✓ Check PostgreSQL is running on localhost:5432
- ✓ Create the `aquas` database if needed
- ✓ Set up Python virtual environment
- ✓ Install backend dependencies
- ✓ Install frontend dependencies  
- ✓ Start FastAPI backend (port 8000)
- ✓ Start Next.js frontend (port 3000)

## Prerequisites

Before running the startup script, ensure you have installed and started:
- **PostgreSQL 12+** (running on localhost:5432)
- **Python 3.8+**
- **Node.js 18+**
- **Bash shell** (via Git Bash, WSL, Cygwin, or native Linux/macOS)

## Starting PostgreSQL

### Windows (via PostgreSQL installer)

If PostgreSQL is installed but not running:

**Option 1: Using Services (easiest)**
1. Press `Win + R`, type `services.msc`, and press Enter
2. Find "postgresql-x64-15" (or your version)
3. Right-click → Start

**Option 2: Using Cygwin/Command Prompt**
```bash
# Check if PostgreSQL service exists
net start postgresql-x64-15

# Or if you know the exact service name
services.msc
```

**Option 3: Start PostgreSQL directly (if installed locally)**
```bash
# Find your PostgreSQL bin directory and run the server
# Example for default Windows installation:
"C:\Program Files\PostgreSQL\15\bin\pg_ctl.exe" -D "C:\Program Files\PostgreSQL\15\data" -l logfile start
```

### macOS (via Homebrew)
```bash
brew services start postgresql
```

### Linux (via systemctl)
```bash
sudo systemctl start postgresql
```

### Verify PostgreSQL is Running

Test the connection:
```bash
psql -U postgres -d postgres -c "SELECT 1"
```

If successful, you'll see:
```
 ?column?
----------
        1
```

**Or use the helper script:**
```bash
./check-postgres.sh
```

This will show PostgreSQL status and instructions if it's not running.

## Running the Script

### First Time Setup
1. Open Cygwin terminal in the project root directory
2. Run:
   ```bash
   ./startup.sh
   ```
3. The script will check prerequisites, create containers, install dependencies, and start all services

### Subsequent Runs
Just run the script again:
```bash
./startup.sh
```

It will reuse existing containers and skip reinstalling dependencies if they're already present.

## Services

Once running, you can access:

| Service | URL | Purpose |
|---------|-----|---------|
| Dashboard | http://localhost:3000 | Main water quality monitoring dashboard |
| API Docs | http://localhost:8000/docs | FastAPI interactive API documentation |
| Health Check | http://localhost:8000/health | Backend health status |
| PostgreSQL | localhost:5432 | Database (user: postgres, password: postgres) |

## Environment Variables

The script automatically sets these for development:

- `DATABASE_URL` = `postgresql://postgres:postgres@localhost:5432/aquas` (backend)
- `AUTH_REQUIRED` = `false` (disables JWT validation for easier testing)
- `NEXT_PUBLIC_API_URL` = `http://localhost:8000` (frontend API endpoint)

### Enabling Strict JWT Validation

To test with proper authentication, set environment variables before running the script:

```bash
export AUTH_REQUIRED="true"
export NEXTAUTH_SECRET="your_secret_key"
./startup.sh
```

Then the backend will require valid JWT tokens in the Authorization header.

## Troubleshooting

### PostgreSQL not found
**Error**: `PostgreSQL is not running on localhost:5432`
- **Solution**: 
  1. Install PostgreSQL from https://www.postgresql.org/download/
  2. During installation, set username: `postgres`, password: `postgres`
  3. After installation, start the PostgreSQL service (see "Starting PostgreSQL" section above)
  4. Test connection: `psql -U postgres -d postgres -c "SELECT 1"`

### Frontend shows "Failed to fetch"
**Error**: Dashboard displays "Failed to fetch" errors on charts
- **Solution**:
  1. Ensure backend is running: `curl http://localhost:8000/health`
  2. Check CORS is enabled (it should be by default)
  3. Verify `NEXT_PUBLIC_API_URL` is set to `http://localhost:8000`
  4. Check browser console (F12) for detailed errors

### Port 3000 or 8000 already in use
**Error**: `Address already in use` when starting frontend or backend
- **Solution**: 
  - Kill the process using that port
  - Or modify port numbers in `backend/run.py` and `frontend/next.config.ts`

## Manual Alternative (3 Terminals)

If you prefer to run services separately or the startup script doesn't work:

### Terminal 1 - Start PostgreSQL (Windows)
```bash
# In Windows Services or via command prompt
net start postgresql-x64-15

# Or in Cygwin, test it's running:
psql -U postgres -d postgres -c "SELECT 1"
```

### Terminal 2 - Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/aquas"
export AUTH_REQUIRED="false"
python run.py
```

### Terminal 3 - Frontend
```bash
cd frontend
npm install
export NEXT_PUBLIC_API_URL="http://localhost:8000"
npm run dev
```

## Stopping Services

The startup script keeps all services running. To stop:
- **Close the PowerShell window**, or
- **Press Ctrl+C** in the terminal

This will terminate all services gracefully.

To clean up PostgreSQL container:
```powershell
docker stop aquas-postgres
docker rm aquas-postgres
```

## Development Workflow

1. **Make backend changes**: Saved changes auto-reload (uvicorn with `--reload`)
2. **Make frontend changes**: Saved changes hot-reload (Next.js dev mode)
3. **Database changes**: May require manual database connection reset
4. **Add new dependencies**: 
   - Backend: Update `backend/requirements.txt`, then restart script
   - Frontend: Update `frontend/package.json`, then restart script

## Next Steps

- Check out the [dashboard](http://localhost:3000) to see your water quality metrics
- View [API documentation](http://localhost:8000/docs) for all available endpoints
- See `backend/insert_sample_data.py` to load sample telemetry data
- Modify metric configurations in `frontend/components/chart-area-interactive.tsx`

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review `backend/TROUBLESHOOTING.md` for backend-specific issues
3. Check browser console (F12) for frontend errors
4. View service logs with `docker logs aquas-postgres` or terminal output
