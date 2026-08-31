# MedPronto - instalacao inteligente (primeira vez ou pasta escolhida pelo usuario)
param(
    [string]$PayloadDir = "",
    [string]$InstallDir = "",
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
    throw "Pacote invalido em: $PayloadDir"
}

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $default = Get-MedProntoDefaultPath -NearPath $PayloadDir
    if (-not $NoGui) {
        $InstallDir = Show-InstallFolderPicker -DefaultPath $default
        if ([string]::IsNullOrWhiteSpace($InstallDir)) { exit 0 }
    } else {
        $InstallDir = $default
        if (Test-InstallDirHasContent $InstallDir) {
            throw "Pasta destino ja tem conteudo ($InstallDir). Use a tela grafica para confirmar apagar os dados, ou escolha pasta vazia."
        }
    }
}
$InstallDir = Normalize-MedProntoRoot $InstallDir

$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "instalacao-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

function Log([string]$msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

$totalSteps = 7
$progress = $null
if (-not $NoGui) {
    $progress = New-MedProntoProgress -Title 'Instalar MedPronto' -TotalSteps $totalSteps
}

try {
    Log "=== Instalacao MedPronto ==="
    Log "payload=$PayloadDir"
    Log "destino=$InstallDir"

    # [1] Pasta de destino (fecha o sistema se ainda estiver na memoria)
    Update-MedProntoProgress $progress 1 'Preparando pasta de instalacao...' 'Fechando o MedPronto se estiver aberto.'
    if (Test-Path -LiteralPath $InstallDir) {
        Log '[1/7] encerrando processos na pasta destino...'
        Stop-MedPronto -InstallDir $InstallDir
        Wait-MedProntoStopped -InstallDir $InstallDir -Seconds 20
    }
    $jaTinhaConteudo = Test-InstallDirHasContent $InstallDir
    if ($PosInno) {
        if (Test-MedProntoLiveInstall $InstallDir) {
            Log '[1/7] pasta com clinica - apagando dados (ja confirmado no assistente)...'
            Clear-MedProntoInstallData -InstallDir $InstallDir
            Log 'dados do destino removidos (data\, .env)'
        } else {
            Log '[1/7] pasta ja conferida pelo assistente'
        }
    } elseif ($jaTinhaConteudo) {
        Log '[1/7] destino com conteudo - apagando dados para instalacao nova...'
        Clear-MedProntoInstallData -InstallDir $InstallDir
        Log 'dados do destino removidos (data\, .env)'
    }
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir 'data') | Out-Null
    Log '[1/7] pasta OK'

    # [2] Copiar arquivos (se payload != destino)
    if ($PosInno -or ($PayloadDir.ToLowerInvariant() -eq $InstallDir.ToLowerInvariant())) {
        Update-MedProntoProgress $progress 2 'Arquivos ja na pasta de instalacao...' 'O assistente copiou com barra de progresso.'
        Log '[2/7] instalacao in-place (sem copia)'
        try { Remove-MedProntoInnoBakTrees -InstallDir $InstallDir } catch { }
    } else {
        Update-MedProntoProgress $progress 2 'Copiando arquivos do pacote...' 'Isso pode levar alguns minutos.'
        Log '[2/7] copiando de payload para destino...'
        Copy-MedProntoPayload -PayloadDir $PayloadDir -InstallDir $InstallDir -PreserveData
    }

    # [3] Node.js
    Update-MedProntoProgress $progress 3 'Verificando Node.js...' 'Componente necessario para o sistema.'
    $tools = Get-MedProntoNodeTools -Root $InstallDir
    if (-not $tools) {
        $dl = Join-Path $InstallDir 'scripts\baixar-node-portatil.ps1'
        if (-not (Test-Path -LiteralPath $dl)) {
            throw 'Node.js nao encontrado. Execute com internet ou inclua a pasta node\ no pacote.'
        }
        Log '[3/7] baixando Node portatil...'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dl -Root $InstallDir
        $tools = Get-MedProntoNodeTools -Root $InstallDir
        if (-not $tools) { throw 'Node.js nao encontrado apos download.' }
    }
    Log "Node: $($tools.Node)"

    # [4] Dependencias
    Update-MedProntoProgress $progress 4 'Instalando componentes...' 'Aguarde - primeira vez pode demorar.'
    $env:PATH = "$($tools.NodeDir);$env:PATH"
    if (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'node_modules'))) {
        Log '[4/7] npm install...'
        Invoke-MedProntoNpm -Tools $tools -WorkDir $InstallDir -Arguments @('install') -OnLine { param($l) Log "  $l" }
    } else {
        Log '[4/7] node_modules OK - verificando better-sqlite3...'
        & $tools.Node -e "const D=require('better-sqlite3'); new D(':memory:');" 2>$null
        if ($LASTEXITCODE -ne 0) {
            Log 'rebuild better-sqlite3...'
            Invoke-MedProntoNpm -Tools $tools -WorkDir $InstallDir -Arguments @('rebuild', 'better-sqlite3') -OnLine { param($l) Log "  $l" }
        }
    }

    # [5] .env + build (dist precisa existir; o pacote do cliente nao traz backend/src)
    $dbPath = Join-Path $InstallDir 'data\medpronto.db'
    $dbExisted = Test-Path -LiteralPath $dbPath
    $envExample = Join-Path $InstallDir '.env.example'
    $envFile = Join-Path $InstallDir '.env'
    if (-not (Test-Path -LiteralPath $envFile) -and (Test-Path -LiteralPath $envExample)) {
        Copy-Item -LiteralPath $envExample -Destination $envFile
        Log '.env criado'
    }
    if (Test-Path -LiteralPath $envFile) {
        $envText = Get-Content -LiteralPath $envFile -Raw
        if ($envText -notmatch '(?m)^ENFORCE_LICENSE\s*=\s*true\s*$') {
            if ($envText -match '(?m)^#\s*ENFORCE_LICENSE\s*=\s*true') {
                $envText = $envText -replace '(?m)^#\s*ENFORCE_LICENSE\s*=\s*true', 'ENFORCE_LICENSE=true'
            } elseif ($envText -match '(?m)^ENFORCE_LICENSE\s*=') {
                $envText = $envText -replace '(?m)^ENFORCE_LICENSE\s*=.*', 'ENFORCE_LICENSE=true'
            } else {
                $envText = $envText.TrimEnd() + "`r`nENFORCE_LICENSE=true`r`n"
            }
            Set-Content -LiteralPath $envFile -Value $envText -Encoding UTF8 -NoNewline
            Log 'ENFORCE_LICENSE=true no .env'
        }
    }
    # [5] Build producao (dist precisa existir antes do db:migrate no pacote sem backend/src)
    Update-MedProntoProgress $progress 5 'Preparando sistema para uso...' 'Compilando telas e servidor.'
    Log '[5/7] build...'
    Ensure-MedProntoBuild -InstallDir $InstallDir -Tools $tools -Log { param($m) Log "  $m" }

    # [6] Banco de dados
    Update-MedProntoProgress $progress 6 'Configurando banco de dados...' 'Agenda, pacientes e prontuarios.'
    Log '[6/7] db:migrate...'
    Invoke-MedProntoNpm -Tools $tools -WorkDir $InstallDir -Arguments @('run', 'db:migrate') -OnLine { param($l) Log "  $l" }

    Log "produto unico (clinico + cobranca)"
    try {
        foreach ($l in @(Apply-MedProntoEdicaoUnica -Root $InstallDir -Tools $tools)) {
            Log "  $l"
        }
    } catch {
        Log "AVISO edicao: $($_.Exception.Message)"
    }

    # [7] Atalhos
    Update-MedProntoProgress $progress 7 'Criando atalhos...' 'Area de Trabalho: MedPronto e Parar.'
    Log '[7/7] atalhos...'
    Register-MedProntoShortcuts -InstallDir $InstallDir
    Save-MedProntoInstallPath -Root $InstallDir

    Update-MedProntoProgress $progress 7 'Instalacao concluida!' 'Pronto para usar.'
    Log '=== Instalacao concluida ==='

    if (-not $NoGui -and -not $PosInno) {
        Close-MedProntoProgress $progress
        $progress = $null
        $start = Show-MedProntoYesNo `
            -Title 'Instalar MedPronto' `
            -Message "Instalacao concluida!`n`nPasta: $InstallDir`n`nDeseja abrir o MedPronto agora?"
        if ($start) {
            $vbs = Join-Path $InstallDir 'iniciar.vbs'
            if (Test-Path -LiteralPath $vbs) {
                Start-Process -FilePath 'wscript.exe' -ArgumentList @('//B', $vbs)
            }
        } else {
            Show-MedProntoMessage `
                -Title 'Instalar MedPronto' `
                -Message "Pronto!`n`nUse o atalho MedPronto na Area de Trabalho.`n`nPasta instalada:`n$InstallDir"
        }
    }
    exit 0
} catch {
    Log "ERRO: $($_.Exception.Message)"
    if ($progress) { Close-MedProntoProgress $progress }
    if (-not $NoGui) {
        Show-MedProntoMessage -Type 'error' -Title 'Instalar MedPronto' `
            -Message "Instalacao nao concluida.`n`n$($_.Exception.Message)`n`nLog: $logFile"
    }
    throw
} finally {
    if ($progress) { Close-MedProntoProgress $progress }
}
