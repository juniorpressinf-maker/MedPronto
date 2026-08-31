# Baixa Node.js 22 LTS portatil para .\node\ (padrao zapmsg offline)
param(
    [string]$Root = "",
    [string]$NodeVersion = "v22.11.0"
)

$ErrorActionPreference = "Stop"
if (-not $Root) { $Root = Split-Path $PSScriptRoot -Parent }

$dest = Join-Path $Root "node"
$nodeExe = Join-Path $dest "node.exe"
if (Test-Path $nodeExe) {
    Write-Host "Node portatil ja existe em $dest"
    exit 0
}

$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
$zipName = "node-$NodeVersion-win-$arch.zip"
$url = "https://nodejs.org/dist/$NodeVersion/$zipName"
$tmp = Join-Path $env:TEMP "agenda-node-$([Guid]::NewGuid().ToString('n'))"
$zip = Join-Path $tmp $zipName

Write-Host "Baixando Node.js $NodeVersion..."
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $tmp -Force

$extracted = Join-Path $tmp "node-$NodeVersion-win-$arch"
if (-not (Test-Path $extracted)) { throw "Extracao falhou" }

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Move-Item $extracted $dest
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Node portatil instalado em $dest"
& $nodeExe -v
