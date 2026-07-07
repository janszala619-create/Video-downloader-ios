$ErrorActionPreference = "Stop"

$port = 8765
$backendRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logDir = Join-Path $backendRoot "logs"
$logPath = Join-Path $logDir "local-server.log"
$errorLogPath = Join-Path $logDir "local-server.err.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    exit 0
}

Set-Location $backendRoot
"$(Get-Date -Format s) Starting VidSave backend on 0.0.0.0:$port." | Add-Content -Path $logPath
Start-Process `
    -FilePath "python.exe" `
    -ArgumentList @("-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "$port") `
    -WorkingDirectory $backendRoot `
    -RedirectStandardOutput $logPath `
    -RedirectStandardError $errorLogPath `
    -WindowStyle Hidden

exit 0
