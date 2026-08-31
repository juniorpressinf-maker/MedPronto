# Abre a tela de inicializacao (splash) imediatamente — sem aguardar servidores
param(
    [string]$Root = ""
)

if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = Split-Path -Parent $PSScriptRoot
}

$profileDir = Join-Path $Root "data\edge-medpronto"
$splashPath = Join-Path $Root "splash\iniciando.html"
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

if (-not (Test-Path -LiteralPath $splashPath)) {
    Write-Error "Splash nao encontrado: $splashPath"
    exit 1
}

function Find-Browser {
    $candidates = @(
        @{ Path = Join-Path ${env:ProgramFiles} "Microsoft\Edge\Application\msedge.exe" },
        @{ Path = Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe" },
        @{ Path = Join-Path ${env:ProgramFiles} "Google\Chrome\Application\chrome.exe" },
        @{ Path = Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe" }
    )
    foreach ($c in $candidates) {
        if ($c.Path -and (Test-Path -LiteralPath $c.Path)) {
            return $c.Path
        }
    }
    return $null
}

$resolved = (Resolve-Path -LiteralPath $splashPath).Path
$fileUri = "file:///" + ($resolved -replace '\\', '/')

$browser = Find-Browser
$args = @(
    "--app=$fileUri",
    "--user-data-dir=$profileDir",
    "--start-maximized",
    "--no-first-run",
    "--disable-sync",
    "--no-default-browser-check"
)

if ($browser) {
    Start-Process -FilePath $browser -ArgumentList $args
    exit 0
}

Start-Process $fileUri
exit 1
