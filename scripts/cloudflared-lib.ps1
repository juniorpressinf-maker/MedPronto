# MedPronto — cloudflared para tunel remoto (empacotador e instalador)

function Ensure-CloudflaredInDir {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TargetDir,
        [string]$CacheDir = '',
        [switch]$AllowDownload
    )

    $TargetDir = $TargetDir.TrimEnd('\', '/')
    $binDir = Join-Path $TargetDir 'bin'
    $dest = Join-Path $binDir 'cloudflared.exe'
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null

    if (Test-Path -LiteralPath $dest) { return $true }

    $projectRoot = Split-Path $PSScriptRoot -Parent
    $candidates = @(
        (Join-Path $projectRoot 'bin\cloudflared.exe'),
        'C:\zapmsg\bin\cloudflared.exe'
    )
    if ($CacheDir) {
        $candidates += Join-Path $CacheDir 'cloudflared.exe'
    }

    foreach ($src in $candidates) {
        if (-not (Test-Path -LiteralPath $src)) { continue }
        Copy-Item -LiteralPath $src -Destination $dest -Force
        if ($CacheDir) {
            New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
            $cached = Join-Path $CacheDir 'cloudflared.exe'
            if (-not (Test-Path -LiteralPath $cached)) {
                Copy-Item -LiteralPath $dest -Destination $cached -Force
            }
        }
        return $true
    }

    if (-not $AllowDownload) { return $false }

    try {
        if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
            $asset = 'cloudflared-windows-arm64.exe'
        } else {
            $asset = 'cloudflared-windows-amd64.exe'
        }
        $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/$asset"
        $tmp = Join-Path $env:TEMP "cloudflared-dl-$(Get-Random).exe"
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
        Copy-Item -LiteralPath $tmp -Destination $dest -Force
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        if ($CacheDir) {
            New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
            Copy-Item -LiteralPath $dest -Destination (Join-Path $CacheDir 'cloudflared.exe') -Force
        }
        return $true
    } catch {
        return $false
    }
}
