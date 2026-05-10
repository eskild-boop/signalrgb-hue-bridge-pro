<#
.SYNOPSIS
  CLI wrapper around the SignalRGB local Signal API (Pro required).

.DESCRIPTION
  The API listens on http://127.0.0.1:16038/api/v1 once SignalRGB is running.
  This script exposes the most useful operations as one-shot subcommands so
  you can switch effects, list installed effects, change brightness, or
  switch saved canvas layouts without opening the GUI.

.EXAMPLE
  .\srgb.ps1 current
  .\srgb.ps1 list
  .\srgb.ps1 apply 'Battlefield 6'
  .\srgb.ps1 brightness 50
  .\srgb.ps1 next
  .\srgb.ps1 layout
  .\srgb.ps1 layout set msi
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet('current', 'list', 'apply', 'brightness', 'on', 'off', 'next', 'previous', 'shuffle', 'layout')]
    [string]$Command,

    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$base = 'http://127.0.0.1:16038/api/v1'

function Invoke-Srgb {
    param([string]$Path, [string]$Method = 'GET', $Body)
    $params = @{
        Uri         = "$base$Path"
        Method      = $Method
        TimeoutSec  = 5
        ErrorAction = 'Stop'
    }
    if ($Body) { $params.Body = ($Body | ConvertTo-Json -Compress); $params.ContentType = 'application/json' }
    try { Invoke-RestMethod @params } catch {
        $code = $_.Exception.Response.StatusCode.value__
        Write-Error "SignalRGB API $Method $Path failed: HTTP $code -- $($_.Exception.Message)"
        exit 1
    }
}

function Get-Effects {
    (Invoke-Srgb '/lighting/effects').data.items
}

function Find-EffectId {
    param([string]$Name)
    $all = Get-Effects
    $exact = $all | Where-Object { $_.attributes.name -eq $Name }
    if ($exact) { return $exact.id }
    $partial = $all | Where-Object { $_.attributes.name -like "*$Name*" }
    if ($partial.Count -eq 1) { return $partial[0].id }
    if ($partial.Count -gt 1) {
        Write-Host "Ambiguous effect name '$Name'. Matches:" -ForegroundColor Yellow
        $partial | ForEach-Object { Write-Host "  $($_.attributes.name)" }
        exit 1
    }
    Write-Error "No installed effect matches '$Name'."
    exit 1
}

switch ($Command) {
    'current' {
        $r = Invoke-Srgb '/lighting'
        $a = $r.data.attributes
        $state = if ($a.enabled) { 'ON' } else { 'OFF' }
        Write-Host ("[{0}] {1} (brightness {2})" -f $state, $a.name, $a.global_brightness) -ForegroundColor Cyan
        if ($a.queue) {
            Write-Host "Recent: $((($a.queue | ForEach-Object name) -join ', '))" -ForegroundColor DarkGray
        }
    }
    'list' {
        Get-Effects | Sort-Object { $_.attributes.name } |
            ForEach-Object { '{0,-30} {1}' -f $_.attributes.name, $_.id }
    }
    'apply' {
        if (-not $Arguments -or $Arguments.Count -eq 0) { throw "Usage: srgb apply '<effect name>'" }
        $name = $Arguments -join ' '
        $id = Find-EffectId $name
        $encoded = [uri]::EscapeDataString($id)
        $r = Invoke-Srgb "/lighting/effects/$encoded/apply" 'POST'
        Write-Host "Applied: $name (id: $id) - status: $($r.status)" -ForegroundColor Green
    }
    'brightness' {
        if (-not $Arguments -or $Arguments.Count -eq 0) { throw 'Usage: srgb brightness 0..100' }
        $n = [int]$Arguments[0]
        if ($n -lt 0 -or $n -gt 100) { throw 'Brightness must be 0..100' }
        Invoke-Srgb '/lighting/global_brightness' 'PATCH' @{ global_brightness = $n } | Out-Null
        Write-Host "Brightness -> $n" -ForegroundColor Green
    }
    'on'  {
        Invoke-Srgb '/lighting/enabled' 'PATCH' @{ enabled = $true } | Out-Null
        Write-Host 'Lighting ON' -ForegroundColor Green
    }
    'off' {
        Invoke-Srgb '/lighting/enabled' 'PATCH' @{ enabled = $false } | Out-Null
        Write-Host 'Lighting OFF' -ForegroundColor Yellow
    }
    'next' {
        Invoke-Srgb '/lighting/next' 'POST' | Out-Null
        Write-Host 'Next effect' -ForegroundColor Cyan
    }
    'previous' {
        Invoke-Srgb '/lighting/previous' 'POST' | Out-Null
        Write-Host 'Previous effect' -ForegroundColor Cyan
    }
    'shuffle' {
        Invoke-Srgb '/lighting/shuffle' 'POST' | Out-Null
        Write-Host 'Shuffled' -ForegroundColor Cyan
    }
    'layout' {
        if (-not $Arguments -or $Arguments.Count -eq 0) {
            $cur = (Invoke-Srgb '/scenes/current_layout').data.current_layout.id
            $all = (Invoke-Srgb '/scenes/layouts').data.items | ForEach-Object id
            Write-Host "Current: $cur" -ForegroundColor Cyan
            Write-Host "Available: $($all -join ', ')"
        }
        elseif ($Arguments[0] -eq 'set') {
            if ($Arguments.Count -lt 2) { throw 'Usage: srgb layout set <id>' }
            $id = $Arguments[1]
            Invoke-Srgb '/scenes/current_layout' 'PATCH' @{ layout = $id } | Out-Null
            Write-Host "Layout -> $id" -ForegroundColor Green
        }
        else {
            throw 'Usage: srgb layout [set <id>]'
        }
    }
}
