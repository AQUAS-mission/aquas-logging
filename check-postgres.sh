#!/bin/bash
# ======================================================================
# PostgreSQL Status Check
# ======================================================================
# Quick utility to check if PostgreSQL is running and accessible

echo "Checking PostgreSQL status..."
echo ""

if psql -U postgres -d postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo "✓ PostgreSQL is running and accessible"
    echo ""
    
    # Check if aquas database exists
    if psql -U postgres -d postgres -c "\l" | grep -q "aquas"; then
        echo "✓ Database 'aquas' exists"
    else
        echo "⚠ Database 'aquas' does not exist (will be created by startup.sh)"
    fi
    
    # Get PostgreSQL version
    echo ""
    echo "PostgreSQL version:"
    psql -U postgres -d postgres -c "SELECT version();" | head -1
    
    echo ""
    echo "You can now run: ./startup.sh"
else
    echo "✗ PostgreSQL is not running or not accessible"
    echo ""
    echo "To start PostgreSQL on Windows:"
    echo "  1. Open Services (Win + R, type 'services.msc')"
    echo "  2. Find 'postgresql-x64-15' (or your version)"
    echo "  3. Right-click → Start"
    echo ""
    echo "Or use the command:"
    echo "  net start postgresql-x64-15"
    echo ""
    echo "Default credentials:"
    echo "  Username: postgres"
    echo "  Password: postgres"
    echo "  Host: localhost:5432"
fi
