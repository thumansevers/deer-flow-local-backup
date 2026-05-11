param(
    [int[]]$Ports = @(8001, 3000, 8081)
)

$ErrorActionPreference = "Stop"

foreach ($Port in $Ports) {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) {
        Write-Host "No listener on port $Port"
        continue
    }

    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($ProcessId in $processIds) {
        $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($process) {
            Stop-Process -Id $ProcessId -Force
            Write-Host "Stopped $($process.ProcessName) on port $Port (PID $ProcessId)"
        }
    }
}
