# Encerra API, tunel e navegador do MedPronto nesta pasta (sem depender do wmic).
param(
    [string]$InstallDir = ""
)

$ErrorActionPreference = 'Continue'

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $InstallDir = Split-Path -Parent $PSScriptRoot
}
$InstallDir = $InstallDir.Trim().Trim('"').TrimEnd('\', '/')
if ([string]::IsNullOrWhiteSpace($InstallDir)) { exit 0 }

function Get-PidsListeningOnPort {
    param([int]$Port)
    $found = @()
    try {
        $rows = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($r in @($rows)) {
            if ($r.OwningProcess) { $found += [int]$r.OwningProcess }
        }
    } catch { }
    if ($found.Count -eq 0) {
        $out = & netstat.exe -ano 2>$null
        foreach ($line in @($out)) {
            if ($line -notmatch 'LISTENING') { continue }
            if ($line -notmatch ":$Port\s") { continue }
            if ($line -match '\s(\d+)\s*$') { $found += [int]$Matches[1] }
        }
    }
    return @($found | Where-Object { $_ -gt 0 } | Select-Object -Unique)
}

function Stop-PidSafe {
    param([int]$ProcessId)
    if ($ProcessId -le 0) { return }
    if ($ProcessId -eq $PID) { return }
    try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch { }
}

foreach ($uri in @(
        'http://127.0.0.1:3021/api/auth/logout',
        'http://127.0.0.1:3021/api/shutdown'
    )) {
    try {
        Invoke-WebRequest -UseBasicParsing -Method POST -Uri $uri -TimeoutSec 3 | Out-Null
    } catch { }
}

Start-Sleep -Milliseconds 600

$rootPrefix = $InstallDir + '\'
$deadline = (Get-Date).AddSeconds(15)

do {
    foreach ($port in 3021, 5176) {
        foreach ($procId in @(Get-PidsListeningOnPort $port)) {
            Stop-PidSafe $procId
        }
    }

    $procs = @()
    try {
        $procs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    } catch {
        $procs = @()
    }

    foreach ($p in $procs) {
        $name = [string]$p.Name
        $exe = [string]$p.ExecutablePath
        $cmd = [string]$p.CommandLine
        $id = 0
        try { $id = [int]$p.ProcessId } catch { continue }
        if ($id -le 0) { continue }

        $underRoot = $false
        if ($exe -and $exe.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            $underRoot = $true
        }
        $cmdHasRoot = $false
        if ($cmd) {
            if ($cmd.IndexOf($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $cmdHasRoot = $true }
            elseif ($cmd.IndexOf($InstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $cmdHasRoot = $true }
        }

        $isNode = $name -ieq 'node.exe'
        $isTunnel = $name -ieq 'cloudflared.exe'
        $isLauncher = $name -ieq 'wscript.exe' -or $name -ieq 'cscript.exe'
        $isBrowser = ($name -ieq 'msedge.exe' -or $name -ieq 'chrome.exe') -and
            ($cmd -and $cmd.IndexOf('edge-medpronto', [StringComparison]::OrdinalIgnoreCase) -ge 0)

        if (($isNode -or $isTunnel -or $isLauncher) -and ($underRoot -or $cmdHasRoot)) {
            Stop-PidSafe $id
        } elseif ($isBrowser) {
            Stop-PidSafe $id
        }
    }

    try {
        foreach ($gp in @(Get-Process -Name node, cloudflared, wscript, cscript -ErrorAction SilentlyContinue)) {
            $gpPath = $null
            try { $gpPath = [string]$gp.Path } catch { continue }
            if (-not $gpPath) { continue }
            if (-not $gpPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { continue }
            Stop-PidSafe ([int]$gp.Id)
        }
    } catch { }

    Start-Sleep -Milliseconds 400
    $still = @(Get-PidsListeningOnPort 3021) + @(Get-PidsListeningOnPort 5176)
} while ($still.Count -gt 0 -and (Get-Date) -lt $deadline)

foreach ($rel in @(
        'logs\api.pid',
        'logs\web.pid',
        'logs\dev.pid',
        'data\iniciar.lock'
    )) {
    $p = Join-Path $InstallDir $rel
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
    }
}

exit 0
