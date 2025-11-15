"""
Simple startup script for AQUAS FastAPI backend.
Run this from the backend directory with: python run.py
"""

import sys
import os
from pathlib import Path

backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/aquas"
    print(f"ℹ️  Using default DATABASE_URL: {os.environ['DATABASE_URL']}")

if __name__ == "__main__":
    import uvicorn
    from app import app
    
    print("\n" + "="*60)
    print("🚀 Starting AQUAS Logging API")
    print("="*60)
    print(f"📍 Backend: http://127.0.0.1:8000")
    print(f"📚 Docs: http://127.0.0.1:8000/docs")
    print(f"🏥 Health: http://127.0.0.1:8000/health")
    print("="*60 + "\n")
    
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
