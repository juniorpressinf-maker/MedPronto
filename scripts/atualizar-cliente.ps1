# MedPronto - atualizacao inteligente (preserva data/, .env e banco)
param(
    [string]$InstallDir = "",
    [string]$PayloadDir = "",
    [switch]$NoGui,
    [switch]$PosInno
)

$ErrorActionPreference = 'Stop'
. "$(Join-Path $PSScriptRoot 'instalador-lib.ps1')"

if ([string]::IsNullOrWhiteSpace($PayloadDir)) {
    $PayloadDir = Normalize-MedProntoRoot (Split-Path $PSScriptRoot -Parent)
} else {
    $PayloadDir = Normalize-MedProntoRoot $PayloadDir
}

if (-not (Test-MedProntoPayload $PayloadDir)) {
    throw "Pacote de atualizacao invalido em: $PayloadDir"
}

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $default = Get-MedProntoDefaultPath -NearPath $PayloadDir
    $payloadEhInstalacao = Test-MedProntoLiveInstall $PayloadDir
    if (-not (Test-MedProntoLiveInstall $default) -and $payloadEhInstalacao) {
        $default = $PayloadDir
    }
    if (-not $NoGui) {
        $InstallDir = Show-UpdateFolderPicker -DefaultPath $default
        if ([string]::IsNullOrWhiteSpace($InstallDir)) { exit 0 }
    } else {
        $InstallDir = $default
    }
}
$InstallDir = Normalize-MedProntoRoot $InstallDir

if (-not (Test-MedProntoLiveInstall $InstallDir)) {
    throw "Pasta nao parece ter o MedPronto instalado (falta data\medpronto.db): $InstallDir"
}

# Fecha o sistema ANTES de ler o banco e copiar (arquivo em uso derruba a atualizacao).
Stop-MedPronto -InstallDir $InstallDir
Start-Sleep -Seconds 2
Stop-MedPronto -InstallDir $InstallDir
Wait-MedProntoStopped -InstallDir $InstallDir -Seconds 8

$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "atualizacao-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

function Log([string]$msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

$totalSteps = 6
$progress = $null
if (-not $NoGui) {
    $progress = New-MedProntoProgress -Title 'Atualizar MedPronto' -TotalSteps $totalSteps
}

$backupRoot = $null

try {
    Log "=== Atualizacao MedPronto ==="
    Log "install=$InstallDir"
    Log "payload=$PayloadDir"

    # [1] Parar sistema
    Update-MedProntoProgress $progress 1 'Fechando o MedPronto...' 'Liberando arquivos em uso.'
    Log '[1/6] parando servicos...'
    Stop-MedPronto -InstallDir $InstallDir
    Start-Sleep -Seconds 1
    Stop-MedPronto -InstallDir $InstallDir
    Wait-MedProntoStopped -InstallDir $InstallDir -Seconds 8

    # [2] Backup (no assistente Inno o backup ja rodou ANTES de copiar os arquivos)
    Update-MedProntoProgress $progress 2 'Backup de seguranca...' 'Copiando banco e arquivos do consultorio.'
    if ($PosInno) {
        Log '[2/6] backup ja feito pelo assistente (antes de copiar arquivos)'
        $backupRoot = '(feito pelo assistente de atualizacao)'
    } else {
        Log '[2/6] backup...'
        $backupRoot = Backup-MedProntoInstall -InstallDir $InstallDir -Log { param($m) Log $m }
    }

    # [3] Mesclar arquivos
    if ($PosInno -or ($PayloadDir.ToLowerInvariant() -eq $InstallDir.ToLowerInvariant())) {
        Update-MedProntoProgress $progress 3 'Arquivos ja atualizados pelo assistente...' 'Consultas e cadastros foram preservados.'
        Log '[3/6] payload e destino iguais - pulando copia'
        try { Remove-MedProntoInnoBakTrees -InstallDir $InstallDir } catch { }
    } else {
        Update-MedProntoProgress $progress 3 'Instalando arquivos novos...' 'Consultas e cadastros serao preservados.'
        Log '[3/6] copiando arquivos...'
        Unlock-MedProntoExecutables -InstallDir $InstallDir
        Copy-MedProntoPayload -PayloadDir $PayloadDir -InstallDir $InstallDir -PreserveData
        try { Remove-MedProntoInnoBakTrees -InstallDir $InstallDir } catch { }
    }

    $distWeb = Join-Path $InstallDir 'frontend\dist\index.html'
    $distApi = Join-Path $InstallDir 'backend\dist\index.js'
    if (-not (Test-Path -LiteralPath $distWeb) -or -not (Test-Path -LiteralPath $distApi)) {
        throw 'Pacote incompleto: falta frontend/dist ou backend/dist. Empacote o instalador de novo e tente a atualizacao.'
    }

    # [4] Build se necessario + migracoes
    Update-MedProntoProgress $progress 4 'Atualizando banco de dados...' 'Aplicando melhorias do sistema.'
    $tools = Get-MedProntoNodeTools -Root $InstallDir
    if (-not $tools) {
        throw 'Node.js nao encontrado na pasta da instalacao. Inclua a pasta node\ no pacote ou rode Instalar MedPronto.bat.'
    }

    Log '[4/6] verificando build...'
    Ensure-MedProntoBuild -InstallDir $InstallDir -Tools $tools -Log { param($m) Log "  $m" }

    if (-not (Test-Path -LiteralPath $distApi)) {
        throw 'backend/dist ausente apos o build. A atualizacao nao pode aplicar o banco.'
    }

    Log '[4/6] db:migrate...'
    Invoke-MedProntoNpm -Tools $tools -WorkDir $InstallDir -Arguments @('run', 'db:migrate') -OnLine { param($l) Log "  $l" }
    try { Remove-MedProntoInnoBakTrees -InstallDir $InstallDir } catch { }

    Log "produto unico (clinico + cobranca) - atualizacao nao pergunta edicao"
    try {
        foreach ($l in @(Apply-MedProntoEdicaoUnica -Root $InstallDir -Tools $tools)) {
            Log "  $l"
        }
    } catch {
        Log "AVISO edicao: $($_.Exception.Message)"
    }

    # [5] Atalhos (falha aqui nao pode abortar atualizacao ja aplicada)
    Update-MedProntoProgress $progress 5 'Atualizando atalhos...' 'Area de Trabalho.'
    Log '[5/6] atalhos...'
    try {
        Register-MedProntoShortcuts -InstallDir $InstallDir
    } catch {
        Log "AVISO atalhos: $($_.Exception.Message)"
    }
    Save-MedProntoInstallPath -Root $InstallDir

    # [6] Concluido
    Update-MedProntoProgress $progress 6 'Atualizacao concluida!' 'Pronto para usar.'
    Log '[6/6] concluido'
    Log "OK backup=$backupRoot"

    if (-not $NoGui -and -not $PosInno) {
        Close-MedProntoProgress $progress
        $progress = $null
        Show-MedProntoMessage -Title 'Atualizar MedPronto' -Message @"
Atualizacao concluida!

Pasta: $InstallDir

Seus dados foram preservados.
Backup de seguranca:
$backupRoot

Clique no atalho MedPronto para abrir.
"@
    }
    exit 0
} catch {
    Log "ERRO: $($_.Exception.Message)"
    if ($progress) { Close-MedProntoProgress $progress; $progress = $null }
    if (-not $NoGui) {
        $bk = if ($backupRoot) { "`nBackup: $backupRoot" } else { '' }
        Show-MedProntoMessage -Type 'error' -Title 'Atualizar MedPronto' `
            -Message "Atualizacao nao concluida.`n`n$($_.Exception.Message)`n`nSeus dados continuam na pasta data\.$bk`nLog: $logFile"
    }
    exit 1
} finally {
    if ($progress) { Close-MedProntoProgress $progress }
}
