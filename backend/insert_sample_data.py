"""
Bulk insert sample data from sensor-data.json into the backend.
Run this AFTER the FastAPI backend is running.

Usage:
    python insert_sample_data.py
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta
import httpx

SCRIPT_DIR = Path(__file__).parent
SENSOR_DATA_PATH = SCRIPT_DIR.parent / "frontend" / "mocks" / "sensor-data.json"
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
AUTH_TOKEN = os.getenv("AUTH_TOKEN", "test_token")

METRICS = ["ph", "temperature", "dissolved_oxygen", "electrical_conductivity", "turbidity_ntu"]

async def insert_data():
    """Read sensor-data.json and insert into backend via /ingest/telemetry endpoint."""
    
    print("📊 AQUAS Sample Data Inserter")
    print("=" * 60)
    
    if not SENSOR_DATA_PATH.exists():
        print(f"❌ Error: sensor-data.json not found at {SENSOR_DATA_PATH}")
        return
    
    print(f"✓ Found sensor data file: {SENSOR_DATA_PATH}")
    
    try:
        with open(SENSOR_DATA_PATH, "r") as f:
            sensor_data = json.load(f)
        print(f"✓ Loaded {len(sensor_data)} records")
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        return
    
    total_inserted = 0
    errors = 0
    
    print(f"\n📤 Inserting data to {BACKEND_URL}...")
    print(f"   Using token: {AUTH_TOKEN}")
    print("-" * 60)
    
    headers = {
        "Authorization": f"Bearer {AUTH_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # Calculate time range: spread records over last 30 days
    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        for i, record in enumerate(sensor_data):
            # Spread data points evenly over 30 days
            time_offset = timedelta(minutes=i * (30 * 24 * 60 / len(sensor_data)))
            record_time = thirty_days_ago + time_offset
            ts = record_time.isoformat() + "Z"
            
            for metric in METRICS:
                if metric not in record:
                    continue
                
                payload = {
                    "device_id": "sensor-1",
                    "metric": metric,
                    "value": record[metric],
                    "ts": ts
                }
                
                try:
                    response = await client.post(
                        f"{BACKEND_URL}/ingest/telemetry",
                        json=payload,
                        headers=headers
                    )
                    
                    if response.status_code == 200:
                        total_inserted += 1
                        if (total_inserted) % 25 == 0:
                            print(f"   ✓ Inserted {total_inserted} records...")
                    else:
                        errors += 1
                        if errors == 1: 
                            print(f"\n   ⚠️  First error at record {i}, metric {metric}:")
                            print(f"      Status: {response.status_code}")
                            print(f"      Response: {response.text[:200]}")
                
                except Exception as e:
                    errors += 1
                    if errors == 1:
                        print(f"\n   ⚠️  Connection error: {e}")
                        print(f"      Make sure backend is running at {BACKEND_URL}")
                        return
    
    print("-" * 60)
    print(f"\n✅ Insert Complete!")
    print(f"   Total inserted: {total_inserted}")
    print(f"   Errors: {errors}")
    
    if total_inserted > 0:
        print(f"\n🎉 Success! Your dashboard should now display data.")
        print(f"   Refresh http://localhost:3000 to see the charts.\n")
    else:
        print(f"\n❌ No data was inserted. Check the errors above.\n")

if __name__ == "__main__":
    asyncio.run(insert_data())
