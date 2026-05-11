param(
    [int]$GatewayPort = 8001,
    [int]$FrontendPort = 3000,
    [int]$DbViewerPort = 8081
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"
$LogsDir = Join-Path $RepoRoot "logs"
$DbPath = Join-Path $BackendDir ".deer-flow\data\deerflow.db"
$EnvPath = Join-Path $RepoRoot ".env"

New-Item -ItemType Directory -Force $LogsDir | Out-Null

if (Test-Path $EnvPath) {
    Get-Content $EnvPath | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+?)\s*=\s*(.*)\s*$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            if (
                ($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'"))
            ) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

function Test-PortListening {
    param([int]$Port)
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-HiddenCommand {
    param(
        [string]$WorkingDirectory,
        [string]$Command
    )
    Start-Process -FilePath "cmd.exe" -WindowStyle Hidden -WorkingDirectory $WorkingDirectory -ArgumentList "/d", "/s", "/c", $Command
}

if (-not (Test-PortListening $GatewayPort)) {
    Start-HiddenCommand `
        -WorkingDirectory $BackendDir `
        -Command "set PYTHONPATH=.&& uv run uvicorn app.gateway.app:app --host 127.0.0.1 --port $GatewayPort > ..\logs\gateway-local.log 2>&1"
    Write-Host "Started DeerFlow gateway on http://127.0.0.1:$GatewayPort"
} else {
    Write-Host "Gateway is already listening on port $GatewayPort"
}

if (-not (Test-PortListening $FrontendPort)) {
    Start-HiddenCommand `
        -WorkingDirectory $FrontendDir `
        -Command "pnpm.cmd dev > ..\logs\frontend-local.log 2>&1"
    Write-Host "Started DeerFlow frontend on http://localhost:$FrontendPort"
} else {
    Write-Host "Frontend is already listening on port $FrontendPort"
}

if (-not (Test-Path $DbPath)) {
    New-Item -ItemType Directory -Force (Split-Path $DbPath) | Out-Null
}

if (-not (Test-PortListening $DbViewerPort)) {
    if (-not (Get-Command sqlite_web -ErrorAction SilentlyContinue)) {
        uv tool install sqlite-web | Out-Host
    }
    Start-HiddenCommand `
        -WorkingDirectory $BackendDir `
        -Command "sqlite_web -H 127.0.0.1 -p $DbViewerPort -x .deer-flow\data\deerflow.db > ..\logs\sqlite-web.log 2>&1"
    Write-Host "Started SQLite browser on http://127.0.0.1:$DbViewerPort"
} else {
    Write-Host "SQLite browser is already listening on port $DbViewerPort"
}

Write-Host ""
Write-Host "Logs:"
Write-Host "  $LogsDir\gateway-local.log"
Write-Host "  $LogsDir\frontend-local.log"
Write-Host "  $LogsDir\sqlite-web.log"
