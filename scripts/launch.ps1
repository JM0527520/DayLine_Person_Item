$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$appUrl = 'http://127.0.0.1:4317'
try {
    $ready = $false
    try {
        $response = Invoke-RestMethod -Uri "$appUrl/__dayline_health" -TimeoutSec 2
        if ($response.app -eq 'dayline') { $ready = $true }
    } catch { }

    if (-not $ready) {
        $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
        $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
        if ($nodeCommand) { $nodePath = $nodeCommand.Source }
        elseif (Test-Path -LiteralPath $bundledNode) { $nodePath = $bundledNode }
        else { throw 'Node.js was not found. Install Node.js 20 or newer, then run this launcher again.' }
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) { throw 'The dist folder is missing. Please keep it with this launcher.' }
        $logDir = Join-Path $projectRoot 'output'
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        $serverFile = Join-Path $PSScriptRoot 'serve.mjs'
        Start-Process -FilePath $nodePath -ArgumentList @("`"$serverFile`"") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log') | Out-Null
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 200
            try {
                $response = Invoke-RestMethod -Uri "$appUrl/__dayline_health" -TimeoutSec 1
                if ($response.app -eq 'dayline') { $ready = $true; break }
            } catch { }
        }
        if (-not $ready) { throw 'Startup failed. Check output\server-error.log. Port 4317 may be occupied.' }
    }
    Write-Host "Dayline is ready: $appUrl" -ForegroundColor Green
    try { Start-Process $appUrl }
    catch { Write-Host "Open this address in your browser: $appUrl" }
} catch {
    Write-Host "Dayline could not start: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
