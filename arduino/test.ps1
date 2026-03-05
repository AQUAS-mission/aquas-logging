# AQUAS Complete Test Environment
# Starts both broker and simulator with one command

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   AQUAS Robot Testing Environment" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to arduino directory
Set-Location -Path $PSScriptRoot

# Kill any existing mosquitto processes (except system service)
$existingProcesses = Get-Process -Name mosquitto -ErrorAction SilentlyContinue
if ($existingProcesses) {
    Write-Host "Cleaning up existing Mosquitto processes..." -ForegroundColor Yellow
    foreach ($proc in $existingProcesses) {
        if ($proc.Id -ne 68356) {
            try {
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            } catch {}
        }
    }
    Start-Sleep -Seconds 1
}

# Start Mosquitto broker in background
Write-Host "Starting MQTT Broker (port 1884)..." -ForegroundColor Green
$brokerProcess = Start-Process -FilePath "C:\Program Files\mosquitto\mosquitto.exe" `
    -ArgumentList "-c", "mosquitto_dev.conf" `
    -PassThru `
    -WindowStyle Hidden

Start-Sleep -Seconds 2

if ($brokerProcess -and !$brokerProcess.HasExited) {
    Write-Host "[OK] Broker started (PID: $($brokerProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to start broker" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Starting Robot Simulator..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop everything" -ForegroundColor Yellow
Write-Host ""

# Activate venv and run simulator
$venvPath = Join-Path $PSScriptRoot "..\\.venv\Scripts\Activate.ps1"
& $venvPath

try {
    # Run simulator in foreground
    python mqtt_simulator.py
} finally {
    # Cleanup: Stop broker when simulator exits
    Write-Host "`n" -ForegroundColor Yellow
    Write-Host "Stopping MQTT Broker..." -ForegroundColor Yellow
    
    if ($brokerProcess -and !$brokerProcess.HasExited) {
        Stop-Process -Id $brokerProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Broker stopped" -ForegroundColor Green
    }
    
    Write-Host "[OK] Test environment shut down" -ForegroundColor Green
}
