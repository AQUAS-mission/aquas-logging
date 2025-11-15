"""
Simple direct test of the ingest endpoint
"""
import asyncio
import json
from datetime import datetime
from pathlib import Path

async def test_insert():
    import httpx
    
    # Load one record from sensor data
    sensor_data_path = Path(__file__).parent.parent / "frontend" / "mocks" / "sensor-data.json"
    with open(sensor_data_path) as f:
        records = json.load(f)
    
    record = records[0]
    ts = datetime.fromtimestamp(record["timestamp"]).isoformat()
    
    payload = {
        "device_id": "sensor-1",
        "metric": "ph",
        "value": float(record["ph"]),
        "ts": ts
    }
    
    print(f"Testing single insert with payload:")
    print(json.dumps(payload, indent=2))
    
    headers = {
        "Authorization": "Bearer test_token",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "http://localhost:8000/ingest/telemetry",
                json=payload,
                headers=headers
            )
            print(f"\nStatus: {response.status_code}")
            print(f"Response: {response.text}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_insert())
