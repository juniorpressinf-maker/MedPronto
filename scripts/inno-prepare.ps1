# Chamado pelo assistente Inno ANTES de copiar arquivos (fecha o sistema e faz backup).
param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDir,
    [Parameter(Mandatory = $true)]
    [string]$LibPath,
    [Parameter(Mandatory = $true)]
    [ValidateSet('completa', 'atualizacao')]
    [string]$Kind,
    [string]$LogPath = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($LogPath)) {
    $LogPath = Join-Path $env:TEMP 'medpronto-inno-prepare.log'
}

function Write-PrepLog([string]$Message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    try {
        Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    } catch { }
}

try {
    Set-Content -LiteralPath $LogPath -Value "inno-prepare kind=$Kind dir=$InstallDir" -Encoding UTF8
    if (-not (Test-Path -LiteralPath $LibPath)) {
        throw "Biblioteca do instalador ausente: $LibPath"
    }
    . $LibPath

    $InstallDir = Normalize-MedProntoRoot $InstallDir
    if ([string]::IsNullOrWhiteSpace($InstallDir)) { exit 0 }

    if ($Kind -eq 'atualizacao') {
        if (-not (Test-MedProntoLiveInstall $InstallDir)) {
            throw "Pasta sem MedPronto instalado (falta data\medpronto.db): $InstallDir"
        }
    }

    if (Test-Path -LiteralPath $InstallDir) {
        Write-PrepLog 'fechando o MedPronto (node, tunel e navegador da clinica)'
        Stop-MedPronto -InstallDir $InstallDir
        Start-Sleep -Seconds 1
        Stop-MedPronto -InstallDir $InstallDir
        if ($Kind -eq 'atualizacao') {
            Wait-MedProntoStopped -InstallDir $InstallDir -Seconds 25 -IgnoreDataLock
        } else {
            Wait-MedProntoStopped -InstallDir $InstallDir -Seconds 25
        }
        Write-PrepLog 'afastando node e node_modules para a copia nao achar arquivo em uso'
        Unlock-MedProntoExecutables -InstallDir $InstallDir
        $aindaNode = Test-Path -LiteralPath (Join-Path $InstallDir 'node')
        $aindaMods = Test-Path -LiteralPath (Join-Path $InstallDir 'node_modules')
        Write-PrepLog "apos afastar: node=$aindaNode node_modules=$aindaMods"
    }

    if ($Kind -eq 'atualizacao') {
        Write-PrepLog 'backup da clinica (atualizacao)'
        Backup-MedProntoInstall -InstallDir $InstallDir | Out-Null
    } elseif (Test-MedProntoLiveInstall $InstallDir) {
        Write-PrepLog 'backup da clinica (instalacao completa por cima)'
        Backup-MedProntoInstall -InstallDir $InstallDir -Label 'completa' | Out-Null
    }

    if ($Kind -eq 'completa' -and (Test-InstallDirHasContent $InstallDir)) {
        Write-PrepLog 'fechando de novo e apagando dados para instalacao nova'
        Stop-MedPronto -InstallDir $InstallDir
        Wait-MedProntoStopped -InstallDir $InstallDir -Seconds 15
        Clear-MedProntoInstallData -InstallDir $InstallDir
    }

    Write-PrepLog 'ok'
    exit 0
} catch {
    $msg = $_.Exception.Message
    Write-PrepLog "ERRO: $msg"
    exit 1
}
