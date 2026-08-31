# MedPronto — baixa cloudflared para acesso remoto (mesmo padrão zapmsg)
param(
    [string]$Root = ""
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = Split-Path $PSScriptRoot -Parent
}
$Root = $Root.TrimEnd('\', '/')

if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
    $asset = 'cloudflared-windows-arm64.exe'
} else {
    $asset = 'cloudflared-windows-amd64.exe'
}

$binDir = Join-Path $Root 'bin'
$dest = Join-Path $binDir 'cloudflared.exe'
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

if (Test-Path -LiteralPath $dest) {
    Write-Host "OK: $dest ja existe"
    exit 0
}

$zapmsgBin = 'C:\zapmsg\bin\cloudflared.exe'
if (Test-Path -LiteralPath $zapmsgBin) {
    Copy-Item -LiteralPath $zapmsgBin -Destination $dest -Force
    Write-Host "OK: copiado de $zapmsgBin"
    exit 0
}

$url = "https://github.com/cloudflare/cloudflared/releases/latest/download/$asset"
$tmp = Join-Path $env:TEMP "cloudflared-dl-$(Get-Random).exe"
Write-Host "Baixando $url ..."
$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
Copy-Item -LiteralPath $tmp -Destination $dest -Force
Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
Write-Host "OK: $dest"
