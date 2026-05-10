<#
.SYNOPSIS
  Install or uninstall the SignalRGB Hue Bridge Pro workaround.
.PARAMETER Uninstall
  Remove the user-plugin files, proxy, and scheduled task.
#>
[CmdletBinding()]
param(
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$repoRoot   = $PSScriptRoot
$pluginSrc  = Join-Path $repoRoot 'plugin'
$proxySrc   = Join-Path $repoRoot 'proxy'

$pluginDest = Join-Path ([Environment]::GetFolderPath("MyDocuments")) 'WhirlwindFX\Plugins'
$proxyDest  = Join-Path $env:LOCALAPPDATA 'hue-proxy'
$taskName   = 'HueProxy'

function Stop-ProxyIfRunning {
    $running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -match 'hue-proxy\.js' }
    if ($running) {
        Write-Host "Stopping running proxy (PID $($running.ProcessId))..." -ForegroundColor Yellow
        Stop-Process -Id $running.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

if ($Uninstall) {
    Write-Host "=== Uninstalling SignalRGB Hue Bridge Pro workaround ===" -ForegroundColor Cyan

    Stop-ProxyIfRunning

    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Write-Host "Removing scheduled task '$taskName'..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    foreach ($f in 'PhilipsHue.js','PhilipsHue.qml') {
        $p = Join-Path $pluginDest $f
        if (Test-Path $p) {
            Write-Host "Removing $p" -ForegroundColor Yellow
            Remove-Item $p -Force
        }
    }

    if (Test-Path $proxyDest) {
        Write-Host "Removing $proxyDest" -ForegroundColor Yellow
        Remove-Item $proxyDest -Recurse -Force
    }

    Write-Host "Uninstall complete. Restart SignalRGB to fall back to the bundled plugin." -ForegroundColor Green
    return
}

Write-Host "=== Installing SignalRGB Hue Bridge Pro workaround ===" -ForegroundColor Cyan

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js not found on PATH. Install Node.js 18+ from https://nodejs.org and re-run."
}
Write-Host "Node.js: $($node.Source)" -ForegroundColor Green

# 1) Plugin override
if (-not (Test-Path $pluginDest)) {
    Write-Host "Creating $pluginDest" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $pluginDest -Force | Out-Null
}
foreach ($f in 'PhilipsHue.js','PhilipsHue.qml') {
    Copy-Item -Path (Join-Path $pluginSrc $f) -Destination (Join-Path $pluginDest $f) -Force
    Write-Host ("Installed " + (Join-Path $pluginDest $f)) -ForegroundColor Green
}

# 2) Proxy
if (-not (Test-Path $proxyDest)) {
    New-Item -ItemType Directory -Path $proxyDest -Force | Out-Null
}
Copy-Item -Path (Join-Path $proxySrc 'hue-proxy.js') -Destination (Join-Path $proxyDest 'hue-proxy.js') -Force
Write-Host ("Installed " + (Join-Path $proxyDest 'hue-proxy.js')) -ForegroundColor Green

# 3) Scheduled task to auto-start proxy at logon
Stop-ProxyIfRunning
$proxyJs   = Join-Path $proxyDest 'hue-proxy.js'
# Quote the script path so spaces in $env:LOCALAPPDATA or username don't break Task Scheduler arg parsing.
$action    = New-ScheduledTaskAction -Execute $node.Source -Argument "`"$proxyJs`"" -WorkingDirectory $proxyDest
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                                          -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
                                          -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Registered scheduled task '$taskName' (auto-start at logon)" -ForegroundColor Green

# 4) Start proxy now
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2
$running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'hue-proxy\.js' }
if ($running) {
    Write-Host "Proxy running, PID $($running.ProcessId)" -ForegroundColor Green
} else {
    Write-Host "Proxy did not start; run manually:" -ForegroundColor Yellow
    Write-Host "  node `"$proxyDest\hue-proxy.js`"" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1. Quit SignalRGB from the tray (right-click -> Quit), then relaunch."
Write-Host "  2. Open Devices -> Philips Hue. The bridge should appear."
Write-Host "  3. Click Link, press the round button on top of the bridge within 30 s."
Write-Host "  4. Pick your Entertainment Area, apply an effect, watch lights react."
