"""
Diagnostic script to test backend API and database connection.
Run this from the backend directory after starting the FastAPI server.
"""

import asyncio
import os
import sys
import httpx
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from db import init_db_pool, close_db_pool, query_telemetry_by_metric

async def main():
    print("🔍 AQUAS Dashboard Diagnostic Tool\n")
    print("=" * 60)
    
    # Test 1: Check if backend is running
    print("\n✅ Test 1: Backend Health Check")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:8000/health", timeout=5.0)
            if response.status_code == 200:
                print(f"   ✓ Backend is running: {response.json()}")
            else:
                print(f"   ✗ Backend returned status {response.status_code}")
                return
    except Exception as e:
        print(f"   ✗ Cannot reach backend at http://localhost:8000")
        print(f"     Error: {e}")
        print("\n     FIX: Make sure FastAPI server is running:")
        print("     uvicorn fastapi:app --host 0.0.0.0 --port 8000 --reload")
        return

    # Test 2: Check database connection
    print("\n✅ Test 2: Database Connection")
    try:
        pool = await init_db_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval("SELECT 1")
            if result == 1:
                print("   ✓ Database connection successful")
        
        # Check telemetry table exists
        async with pool.acquire() as conn:
            table_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='telemetry')"
            )
            if table_exists:
                print("   ✓ telemetry table exists")
                
                # Count rows in table
                row_count = await conn.fetchval("SELECT COUNT(*) FROM telemetry")
                print(f"   ℹ  telemetry table has {row_count} rows")
                
                if row_count == 0:
                    print("\n   ⚠️  DATABASE IS EMPTY - This is the issue!")
                    print("      You need to insert data before the dashboard can display it.")
                else:
                    print(f"\n   ✓ Database has {row_count} telemetry records")
            else:
                print("   ✗ telemetry table does not exist")
    except Exception as e:
        print(f"   ✗ Database connection failed: {e}")
        print(f"\n   FIX: Check DATABASE_URL environment variable:")
        print(f"   Current: {os.getenv('DATABASE_URL', 'NOT SET')}")
        return
    finally:
        await close_db_pool()

    # Test 3: Test query endpoint
    print("\n✅ Test 3: Query Endpoint")
    try:
        async with httpx.AsyncClient() as client:
            # Try with test token
            headers = {"Authorization": "Bearer test_token"}
            response = await client.get(
                "http://localhost:8000/query/metric?metric=ph&hours=24",
                headers=headers,
                timeout=5.0
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"   ✓ /query/metric endpoint works")
                print(f"   ℹ  Returned {data['count']} rows for pH metric")
                if data['count'] > 0:
                    print(f"   ✓ Sample data: {data['rows'][0]}")
            elif response.status_code == 401:
                print(f"   ✗ Authentication failed (401)")
                print(f"     Response: {response.text}")
            else:
                print(f"   ✗ Endpoint returned status {response.status_code}")
                print(f"     Response: {response.text}")
    except Exception as e:
        print(f"   ✗ Failed to query endpoint: {e}")

    print("\n" + "=" * 60)
    print("\n📊 Diagnostic Complete!\n")

if __name__ == "__main__":
    asyncio.run(main())
