# Abre MedPronto no Edge/Chrome (modo app + tela cheia) — padrao estnovo
param(
    [string]$Root = "",
    [string]$Url = "http://127.0.0.1:3021/",
    [switch]$SkipHealthWait
)

if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = Split-Path -Parent $PSScriptRoot
}

$profileDir = Join-Path $Root "data\edge-medpronto"
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

function Find-Browser {
    $candidates = @(
        @{ Path = Join-Path ${env:ProgramFiles} "Microsoft\Edge\Application\msedge.exe" },
        @{ Path = Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe" },
        @{ Path = Join-Path ${env:ProgramFiles} "Google\Chrome\Application\chrome.exe" },
        @{ Path = Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe" }
    )
    foreach ($c in $candidates) {
        if ($c.Path -and (Test-Path -LiteralPath $c.Path)) { return $c.Path }
    }
    return $null
}

function Wait-ForUrl([string]$TargetUrl, [int]$MaxSeconds = 90) {
    for ($i = 1; $i -le $MaxSeconds; $i++) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing -Uri $TargetUrl -TimeoutSec 3
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
        } catch { }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Open-DefaultBrowser([string]$TargetUrl) {
    Start-Process $TargetUrl
}

if (-not $SkipHealthWait) {
    if (-not (Wait-ForUrl $Url)) {
        $ws = New-Object -ComObject WScript.Shell
        $ws.Popup(
            "O servidor ainda nao respondeu.`n`nAguarde alguns segundos e abra o MedPronto de novo.",
            12,
            "MedPronto",
            48
        ) | Out-Null
        exit 2
    }
}

$browser = Find-Browser
$args = @(
    "--app=$Url",
    "--user-data-dir=$profileDir",
    "--start-maximized",
    "--no-first-run",
    "--disable-sync",
    "--no-default-browser-check",
    "--overscroll-history-navigation=0",
    "--disable-features=HardwareMediaKeyHandling"
)

if ($browser) {
    try {
        $proc = Start-Process -FilePath $browser -ArgumentList $args -PassThru -ErrorAction Stop
        Start-Sleep -Milliseconds 1200
        if ($proc -and -not $proc.HasExited) { exit 0 }
    } catch { }

  # Perfil Edge pode estar em uso — tenta modo app sem perfil fixo
    try {
        Start-Process -FilePath $browser -ArgumentList @(
            "--app=$Url",
            "--start-maximized",
            "--no-first-run",
            "--no-default-browser-check"
        ) -ErrorAction Stop
        exit 0
    } catch { }
}

Open-DefaultBrowser $Url
exit 0
