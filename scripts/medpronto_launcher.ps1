# MedPronto - abre tudo (servidor + navegador) com splash amigavel
# Uso diario: iniciar.vbs  |  Parar: parar.bat
param(
    [string]$Root = "",
    [switch]$Silent,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Continue'

if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = Split-Path -Parent $PSScriptRoot
} else {
    $Root = $Root.TrimEnd('\', '/')
}
Set-Location -LiteralPath $Root

$DataDir = Join-Path $Root 'data'
$Log = Join-Path $DataDir 'medpronto.log'
$ApiLog = Join-Path $DataDir 'api.log'
$ErrFile = Join-Path $Root 'ULTIMO-ERRO.txt'
$StatusFile = Join-Path $DataDir 'status.txt'
$LockFile = Join-Path $DataDir 'iniciar.lock'
$Url = 'http://127.0.0.1:3021/login?reabrir=1'
$AppName = 'MedPronto'
$maxWaitSec = 240

$script:lastNotifyTick = 0
$script:lastNotifyMsg = ''

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

function Write-Log([string]$Msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Msg"
    if (-not $Silent) { Write-Host $Msg }
    for ($try = 0; $try -lt 8; $try++) {
        try {
            [System.IO.File]::AppendAllText($Log, $line + [Environment]::NewLine)
            return
        } catch {
            Start-Sleep -Milliseconds 150
        }
    }
}

function Write-Status([string]$Message) {
    Set-Content -LiteralPath $StatusFile -Value "[$(Get-Date -Format 'HH:mm:ss')] $Message" -Encoding UTF8
}

function Notify-User([string]$Message, [int]$ToastSec = 5, [switch]$Force) {
    Write-Status $Message
    Write-Log $Message
    if (-not $Silent) { return }
    $tick = [DateTime]::UtcNow.Ticks
    if (-not $Force -and $script:lastNotifyMsg -eq $Message) { return }
    if (-not $Force -and ($tick - $script:lastNotifyTick) -lt (3 * [TimeSpan]::TicksPerSecond)) { return }
    $script:lastNotifyTick = $tick
    $script:lastNotifyMsg = $Message
    try {
        $msg = ($Message -replace "'", "''") -replace "`r?`n", " | "
        Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
            '-NoProfile', '-Command',
            "`$w=New-Object -ComObject WScript.Shell; `$w.Popup('$msg',$ToastSec,'$AppName',64)|Out-Null"
        ) | Out-Null
    } catch { }
}

function Show-Error([string]$Message) {
    Write-Log "*** $Message"
    $tail = '(sem log)'
    if (Test-Path -LiteralPath $Log) {
        $lines = Get-Content -LiteralPath $Log -Tail 25 -ErrorAction SilentlyContinue
        if ($lines) { $tail = ($lines -join [Environment]::NewLine) }
    }
    Set-Content -LiteralPath $ErrFile -Value "$Message`r`n`r`n$tail" -Encoding UTF8
    Clear-StartupLock

    if ($Silent) {
        $ws = New-Object -ComObject WScript.Shell
        $ws.Popup($Message, 20, $AppName, 48) | Out-Null
    } else {
        Write-Host "ERRO: $Message" -ForegroundColor Red
        Read-Host 'Pressione Enter'
    }
    exit 1
}

function Test-ServersReadyOnce {
    try {
        $api = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3021/api/health' -TimeoutSec 5
        if ($api.StatusCode -ne 200) { return $false }
        $ab = $api.Content.ToLowerInvariant()
        if ($ab -notmatch '"ok"\s*:\s*true' -and $ab -notmatch "'ok'") { return $false }
    } catch { return $false }

    try {
        $web = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3021/login' -TimeoutSec 5
        if ($web.StatusCode -ne 200) { return $false }
        $wb = $web.Content.ToLowerInvariant()
        if ($wb -notmatch 'id="root"' -and $wb -notmatch 'medpronto') { return $false }
    } catch { return $false }

    return $true
}

function Test-ServersReady {
    for ($try = 0; $try -lt 3; $try++) {
        if (Test-ServersReadyOnce) { return $true }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

function Open-Splash {
    if ($NoBrowser) { return }
    $splashScript = Join-Path $PSScriptRoot 'open_medpronto_splash.ps1'
    if (-not (Test-Path -LiteralPath $splashScript)) { return }
    try {
        & $splashScript -Root $Root
        if ($LASTEXITCODE -eq 0) {
            Write-Log 'Splash de inicializacao aberto.'
        } else {
            Write-Log 'AVISO: nao foi possivel abrir splash.'
        }
    } catch {
        Write-Log ('AVISO: splash ignorado - ' + $_.Exception.Message)
    }
}

function Close-Splash {
    if ($NoBrowser) { return }
    $closeScript = Join-Path $PSScriptRoot 'close_medpronto_splash.ps1'
    if (-not (Test-Path -LiteralPath $closeScript)) { return }
    try {
        & $closeScript
        Write-Log 'Splash de inicializacao fechado.'
    } catch {
        Write-Log ('AVISO: fechar splash - ' + $_.Exception.Message)
    }
}

function Open-Browser {
    if ($NoBrowser) { return }
    try {
        Invoke-WebRequest -UseBasicParsing -Method POST `
            -Uri 'http://127.0.0.1:3021/api/auth/logout' -TimeoutSec 3 | Out-Null
    } catch { }
    $openScript = Join-Path $PSScriptRoot 'open_medpronto_browser.ps1'
    if (Test-Path -LiteralPath $openScript) {
        & $openScript -Root $Root -Url $Url -SkipHealthWait
    } else {
        Start-Process $Url
    }
    Write-Log 'Navegador: login aberto.'
}

function Finish-Startup {
    Write-Status 'Abrindo tela de login...'
    Open-Browser
    Close-Splash
}

function Test-LockStale {
    if (-not (Test-Path -LiteralPath $LockFile)) { return $false }
    $age = (Get-Date) - (Get-Item -LiteralPath $LockFile).LastWriteTime
    if ($age.TotalMinutes -gt 4) { return $true }
    $line = (Get-Content -LiteralPath $LockFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($line -match '^(\d+)') {
        $lockPid = [int]$Matches[1]
        if ($lockPid -ne $PID -and -not (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)) {
            return $true
        }
    }
    return $false
}

function Test-LockActive {
    if (-not (Test-Path -LiteralPath $LockFile)) { return $false }
    if (Test-LockStale) { return $false }
    return $true
}

function Set-StartupLock {
    Set-Content -LiteralPath $LockFile -Value "$PID $(Get-Date -Format o)" -Encoding ASCII
}

function Clear-StartupLock {
    Remove-Item -LiteralPath $LockFile -Force -ErrorAction SilentlyContinue
}

function Wait-ForServers([int]$MaxSeconds) {
    for ($i = 1; $i -le $MaxSeconds; $i++) {
        if (Test-ServersReady) { return $true }
        if ($i -eq 15) {
            Notify-User 'Ainda iniciando... pode levar ate 2 minutos.' 5
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Get-NodeTools {
    $portable = Join-Path $Root 'node\node.exe'
    if (Test-Path -LiteralPath $portable) {
        return @{
            Node = $portable
            Npm = Join-Path $Root 'node\npm.cmd'
            NodeDir = Split-Path $portable -Parent
        }
    }

    $checker = Join-Path $Root 'is-node-lts.mjs'
    foreach ($c in (Get-Command node -ErrorAction SilentlyContinue)) {
        if (Test-Path -LiteralPath $checker) {
            & $c.Source $checker 2>$null
            if ($LASTEXITCODE -ne 0) { continue }
        }
        $dir = Split-Path $c.Source -Parent
        $npm = Join-Path $dir 'npm.cmd'
        if (-not (Test-Path -LiteralPath $npm)) { $npm = 'npm.cmd' }
        return @{ Node = $c.Source; Npm = $npm; NodeDir = $dir }
    }
    return $null
}

function Stop-OldServers {
    Write-Log '[0] encerrando servidores antigos...'
    Write-Status 'Preparando ambiente...'
    $parar = Join-Path $Root 'parar.bat'
    if (Test-Path -LiteralPath $parar) {
        $env:MEDPRONTO_QUIET = '1'
        & cmd.exe /c "`"$parar`"" *> $null
        Remove-Item Env:MEDPRONTO_QUIET -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

function Ensure-Build([hashtable]$Tools) {
    $lib = Join-Path $PSScriptRoot 'instalador-lib.ps1'
    . "$lib"

    $needs = Test-MedProntoNeedsBuild -InstallDir $Root
    if (-not $needs.Web -and -not $needs.Api) {
        Write-Log '[build] producao OK'
        return $needs
    }

    if (-not $needs.Api) {
        Write-Status 'Atualizando interface...'
        Notify-User 'Atualizando interface... Aguarde.' 8 -Force
    } else {
        Write-Status 'Preparando sistema...'
        Notify-User 'Preparando sistema... Aguarde.' 8 -Force
    }

    Write-Log '[build] codigo alterado - recompilando...'
    Ensure-MedProntoBuild -InstallDir $Root -Tools $Tools -Log {
        param($m)
        Write-Log "[build] $m"
    } | Out-Null
}

function Sync-BuildIfStale([hashtable]$Tools) {
    $lib = Join-Path $PSScriptRoot 'instalador-lib.ps1'
    . "$lib"

    $needs = Test-MedProntoNeedsBuild -InstallDir $Root
    if (-not $needs.Web -and -not $needs.Api) { return $false }

    Write-Status 'Atualizando sistema...'
    Notify-User 'Compilando atualizacoes (ate 2 min)... Aguarde.' 12 -Force
    Write-Log '[build] alteracoes detectadas com servidor ativo - recompilando...'

    Ensure-MedProntoBuild -InstallDir $Root -Tools $Tools -Log {
        param($m)
        Write-Log "[build] $m"
        if ($m) {
            Write-Status $m
            Notify-User "$m" 6 -Force
        }
    } | Out-Null

    return $needs.Api
}

function Ensure-Dependencies([hashtable]$Tools) {
    $npm = $Tools.Npm
    $node = $Tools.Node
    $env:PATH = "$($Tools.NodeDir);$env:PATH"

    if (-not (Test-Path -LiteralPath (Join-Path $Root 'node_modules'))) {
        Write-Status 'Instalando componentes...'
        Notify-User 'Instalando componentes... Aguarde.' 8 -Force
        Write-Log '[1] npm install...'
        & $npm install 2>&1 | ForEach-Object { Write-Log $_ }
        if ($LASTEXITCODE -ne 0) { throw 'npm install falhou' }
        return
    }

    & $node -e "const D=require('better-sqlite3'); new D(':memory:'); console.log('ok')" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Log '[1] recompilando better-sqlite3...'
        & $npm rebuild better-sqlite3 2>&1 | ForEach-Object { Write-Log $_ }
        if ($LASTEXITCODE -ne 0) { throw 'rebuild better-sqlite3 falhou' }
    }
    Write-Log '[1] dependencias OK'
}

function Start-Servers([hashtable]$Tools) {
    Write-Status 'Iniciando servidores...'
    Notify-User 'Iniciando servidores... aguarde.' 6 -Force
    $npm = $Tools.Npm
    $qRoot = "`"$Root`""
    $qApiLog = "`"$ApiLog`""
    $qNpm = "`"$npm`""

    $apiLoop = @"
cd /d $qRoot
set NODE_ENV=production
set ENFORCE_LICENSE=false
set MEDPRONTO_ROOT=$Root
set PATH=$($Tools.NodeDir);%PATH%
:loop_api
call $qNpm run start -w backend >> $qApiLog 2>&1
set RC=!ERRORLEVEL!
if "!RC!"=="42" (timeout /t 2 /nobreak >nul & goto loop_api)
if exist "$Root\data_restore_pending\" (timeout /t 2 /nobreak >nul & goto loop_api)
timeout /t 3 /nobreak >nul
goto loop_api
"@
    $apiScript = Join-Path $DataDir '_api-loop.cmd'
    Set-Content -LiteralPath $apiScript -Value "@echo off`r`nsetlocal enabledelayedexpansion`r`n$apiLoop" -Encoding ASCII
    Write-Log '[start] MedPronto :3021 (producao)'
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList @('/c', "`"$apiScript`"") `
        -WorkingDirectory $Root `
        -WindowStyle Hidden | Out-Null
}

function Start-FullStack([hashtable]$Tools) {
    Stop-OldServers
    Ensure-Dependencies $tools
    Ensure-Build $tools | Out-Null

    if (-not (Test-Path -LiteralPath (Join-Path $Root '.env'))) {
        $example = Join-Path $Root '.env.example'
        if (Test-Path -LiteralPath $example) {
            Copy-Item -LiteralPath $example -Destination (Join-Path $Root '.env')
            Write-Log '.env criado'
        }
    }

    Start-Servers $tools
    return (Wait-ForServers $maxWaitSec)
}

# --- lock orfao ---
if (Test-LockStale) {
    Write-Log 'Lock antigo detectado - limpando...'
    Clear-StartupLock
}

# --- servidor ja pronto ---
if (Test-ServersReady) {
    Write-Log 'Servidor ja esta rodando.'
    $tools = Get-NodeTools
    if ($tools) {
        if (Test-LockActive) {
            Write-Log 'Outra atualizacao em andamento - abrindo navegador sem recompilar.'
            Notify-User 'Atualizacao em andamento... Abrindo tela.' 6 -Force
        } else {
            Set-StartupLock
            try {
                $apiRebuilt = Sync-BuildIfStale $tools
                if ($apiRebuilt) {
                    Write-Log '[build] backend atualizado - reiniciando servidor...'
                    Stop-OldServers
                    Start-Servers $tools
                    if (-not (Wait-ForServers 90)) {
                        Show-Error "Nao foi possivel reiniciar o ${AppName} apos atualizacao."
                    }
                }
            } finally {
                Clear-StartupLock
            }
        }
    }
    Finish-Startup
    exit 0
}

# --- outro clique em andamento ---
if (Test-LockActive) {
    Write-Log 'Outro inicio em andamento - aguardando...'
    Write-Status 'Aguardando inicio em andamento...'
    Notify-User "$AppName ja esta iniciando... aguarde." 6 -Force
    if (-not $NoBrowser) { Open-Splash }

    if (Wait-ForServers 90) {
        Finish-Startup
        exit 0
    }
    if (Test-ServersReady) {
        Finish-Startup
        exit 0
    }
    Show-Error "Nao foi possivel abrir o ${AppName}.`nO sistema pode ainda estar subindo - aguarde 1-2 min e tente de novo."
}

Set-StartupLock

try {
    Write-Log "=== MedPronto launcher (PID $PID) ==="
    Write-Status "Preparando $AppName..."
    Notify-User "Verificando $AppName..." 4 -Force
    if (-not $NoBrowser) { Open-Splash }

    $tools = Get-NodeTools
    if (-not $tools) {
        Show-Error 'Node.js nao encontrado. Execute instalar.bat.'
    }
    Write-Log "Node: $($tools.Node)"

    $ok = Start-FullStack $tools
    if ($ok -or (Test-ServersReady)) {
        Write-Status 'Quase pronto...'
        Finish-Startup
        exit 0
    }

    Show-Error "Nao foi possivel abrir o ${AppName}.`nO sistema pode ainda estar subindo - aguarde 1-2 min e tente de novo."
} catch {
    Write-Log "ERRO: $($_.Exception.Message)"
    Show-Error $_.Exception.Message
} finally {
    Clear-StartupLock
}
