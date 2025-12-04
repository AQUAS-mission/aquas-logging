#!/bin/bash
# ======================================================================
# AQUAS Dashboard Full Stack Startup Script (PostgreSQL Direct)
# ======================================================================
# This script starts Backend (FastAPI) and Frontend (Next.js) with
# PostgreSQL running directly (not in Docker).
#
# Prerequisites: PostgreSQL must be installed and running on localhost:5432
# Usage: ./startup.sh
# ======================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        AQUAS Dashboard Full Stack Startup Script            ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ======================================================================
# Step 1: Check Prerequisites
# ======================================================================
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"

# Check if PostgreSQL is running
if ! /cygdrive/c/Program\ Files/PostgreSQL/18/bin/psql.exe -h 127.0.0.1 -U postgres -d postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}✗ PostgreSQL is not running on localhost:5432${NC}"
    echo -e "${YELLOW}   Please start PostgreSQL and ensure it's accessible with default credentials${NC}"
    echo -e "${YELLOW}   (user: postgres, password: postgres)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL is running${NC}"

# Check if Python is available
if ! command -v python &> /dev/null; then
    echo -e "${RED}✗ Python not found. Please install Python.${NC}"
    exit 1
fi
PYTHON_VERSION=$(python --version 2>&1)
echo -e "${GREEN}✓ Python is installed: $PYTHON_VERSION${NC}"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found. Please install Node.js.${NC}"
    exit 1
fi
NODE_VERSION=$(node --version 2>&1)
echo -e "${GREEN}✓ Node.js is installed: $NODE_VERSION${NC}"

echo ""

# ======================================================================
# Step 2: Check/Create PostgreSQL Database
# ======================================================================
echo -e "${YELLOW}🐘 Setting up PostgreSQL database...${NC}"

if /cygdrive/c/Program\ Files/PostgreSQL/18/bin/psql.exe -h 127.0.0.1 -U postgres -d postgres -c "\l" | grep -q "aquas"; then
    echo -e "${GREEN}✓ Database 'aquas' already exists${NC}"
else
    echo -e "${CYAN}↻ Creating 'aquas' database...${NC}"
    if ! /cygdrive/c/Program\ Files/PostgreSQL/18/bin/psql.exe -h 127.0.0.1 -U postgres -d postgres -c "CREATE DATABASE aquas;" > /dev/null 2>&1; then
        echo -e "${RED}✗ Failed to create database${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Database 'aquas' created${NC}"
fi

echo ""

# ======================================================================
# Step 3: Backend Setup
# ======================================================================
echo -e "${YELLOW}🔙 Setting up Backend...${NC}"

cd "$BACKEND_DIR"

# Check if venv exists, create if not
if [ ! -d ".venv" ]; then
    echo -e "${CYAN}↻ Creating Python virtual environment...${NC}"
    python -m venv .venv > /dev/null
    echo -e "${GREEN}✓ Virtual environment created${NC}"
else
    echo -e "${GREEN}✓ Virtual environment already exists${NC}"
fi

# Activate venv - try Cygwin path first, fall back to Windows path
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
elif [ -f ".venv/Scripts/activate" ]; then
    source .venv/Scripts/activate
else
    echo -e "${YELLOW}⚠ Could not find venv activation script, proceeding anyway${NC}"
fi

# Install/upgrade backend dependencies
echo -e "${CYAN}↻ Installing backend dependencies...${NC}"
pip install -q -r requirements.txt
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"
else
    echo -e "${RED}✗ Failed to install backend dependencies${NC}"
    exit 1
fi

echo ""

# ======================================================================
# Step 4: Frontend Setup
# ======================================================================
echo -e "${YELLOW}🎨 Setting up Frontend...${NC}"

cd "$FRONTEND_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${CYAN}↻ Installing frontend dependencies (npm install)...${NC}"
    npm install --silent > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
    else
        echo -e "${RED}✗ Failed to install frontend dependencies${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ Frontend dependencies already installed${NC}"
fi

echo ""

# ======================================================================
# Step 5: Start Services
# ======================================================================
echo -e "${YELLOW}🚀 Starting all services...${NC}"
echo ""

# Trap to clean up background processes on exit
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down services...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Start Backend
echo -e "${CYAN}▶ Starting Backend on port 8000...${NC}"
cd "$BACKEND_DIR"

export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/aquas"
export AUTH_REQUIRED="false"

# Use the root venv python (where all dependencies are installed)
# Handle paths with spaces by using full quoted paths
PYTHON_BIN="$SCRIPT_DIR/.venv/Scripts/python.exe"

# Convert Windows path to Cygwin path if needed
PYTHON_BIN_CYGWIN=$(cygpath -u "$PYTHON_BIN")

if [ -f "$PYTHON_BIN_CYGWIN" ]; then
    "$PYTHON_BIN_CYGWIN" run.py > /tmp/aquas_backend.log 2>&1 &
else
    # Fallback: try direct Windows path
    "$PYTHON_BIN" run.py > /tmp/aquas_backend.log 2>&1 &
fi

BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Check if backend is running
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is running and healthy${NC}"
else
    echo -e "${YELLOW}⚠ Backend may still be starting...${NC}"
fi

echo ""

# Start Frontend
echo -e "${CYAN}▶ Starting Frontend on port 3000...${NC}"
cd "$FRONTEND_DIR"
export NEXT_PUBLIC_API_URL="http://localhost:8000"
npm run dev > /tmp/aquas_frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 5

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           ✓ All Services Started Successfully!              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}📊 Dashboard:          http://localhost:3000${NC}"
echo -e "${CYAN}📚 API Docs:           http://localhost:8000/docs${NC}"
echo -e "${CYAN}🏥 API Health:         http://localhost:8000/health${NC}"
echo -e "${CYAN}🐘 PostgreSQL:         localhost:5432${NC}"
echo ""
echo -e "${YELLOW}ℹ️  Service Details:${NC}"
echo -e "  • Backend runs with AUTH_REQUIRED=false (no token needed in dev)"
echo -e "  • Frontend can query all metrics (pH, temperature, etc.)"
echo -e "  • Database: aquas (PostgreSQL on localhost:5432)"
echo ""
echo -e "${YELLOW}🛑 To stop all services, press Ctrl+C${NC}"
echo ""
echo -e "Backend logs:   tail -f /tmp/aquas_backend.log"
echo -e "Frontend logs:  tail -f /tmp/aquas_frontend.log"
echo ""

# Wait for background processes
wait
