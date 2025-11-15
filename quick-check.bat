@echo off
REM Quick diagnostic check for AQUAS Dashboard
REM Run this from the project root in PowerShell

echo.
echo 🔍 AQUAS Dashboard Quick Diagnostic
echo ====================================
echo.

echo ✓ Checking backend health...
powershell -NoProfile -Command "try { $r = Invoke-RestMethod http://127.0.0.1:8000/health -ErrorAction Stop; Write-Host '   ✓ Backend is RUNNING' -ForegroundColor Green } catch { Write-Host '   ✗ Backend is NOT running' -ForegroundColor Red; Write-Host '     Start it: uvicorn fastapi:app --host 0.0.0.0 --port 8000 --reload' }"

echo.
echo ✓ Checking database...
powershell -NoProfile -Command "try { $r = Invoke-RestMethod 'http://127.0.0.1:8000/query/metric?metric=ph&hours=24' -Headers @{'Authorization'='Bearer test_token'} -ErrorAction Stop; if ($r.count -gt 0) { Write-Host '   ✓ Database has ' $r.count ' records' -ForegroundColor Green } else { Write-Host '   ✗ Database is EMPTY - insert data with: python insert_sample_data.py' -ForegroundColor Yellow } } catch { Write-Host '   ✗ Database error or backend not responding' -ForegroundColor Red }"

echo.
echo ✓ Checking frontend .env...
powershell -NoProfile -Command "if (Select-String -Path 'frontend\.env' -Pattern 'NEXT_PUBLIC_API_URL' -Quiet) { Write-Host '   ✓ NEXT_PUBLIC_API_URL is set' -ForegroundColor Green } else { Write-Host '   ✗ NEXT_PUBLIC_API_URL missing from .env' -ForegroundColor Red }"

echo.
echo ====================================
echo Done! For more help: see TROUBLESHOOTING.md
echo.
