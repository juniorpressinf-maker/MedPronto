# Empacota o MedPronto em dois EXE auto-suficientes para Windows.
# Padrao zapmsg: Node portatil + node_modules pre-instalado.
#
# Resultado: MedPronto-instalacao-completa.exe e MedPronto-atualizacao.exe
# Uso: "Empacotar Instalador.bat"

[CmdletBinding()]
param(
    [string]$NodeVersion = 'v22.11.0',
    [string]$Arch = 'x64',
    [ValidateSet('rapido', 'otimizado')]
    [string]$ModoCompactacao = 'rapido',
    [switch]$KeepCache
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
. "$(Join-Path $PSScriptRoot 'scripts\empacotar-lib.ps1')"
. "$(Join-Path $PSScriptRoot 'scripts\instalador-lib.ps1')"
$cfLib = Join-Path $PSScriptRoot 'scripts\cloudflared-lib.ps1'
if (Test-Path -LiteralPath $cfLib) {
    . "$cfLib"
} else {
    function Ensure-CloudflaredInDir { return $false }
}

$root = $PSScriptRoot
$cacheDir = Join-Path $root '.cache'
$progress = $null
$staging = $null
$empacoteOk = $false

Write-Host ''
Write-Host '=== MedPronto :: Empacotar Instalador (Windows) ===' -ForegroundColor Cyan
Write-Host "Origem      : $root" -ForegroundColor Gray
Write-Host "Saida       : MedPronto-instalacao-completa.exe + MedPronto-atualizacao.exe" -ForegroundColor Gray
Write-Host "Node.js     : $NodeVersion ($Arch)" -ForegroundColor Gray
Write-Host "Compactacao : $ModoCompactacao" -ForegroundColor Gray
Write-Host ''

try {
    $progress = New-MedProntoProgress -Title 'Empacotar MedPronto' -TotalSteps 8
} catch {
    Write-Host 'Janela de progresso indisponivel; o andamento segue neste console.' -ForegroundColor Yellow
    $progress = $null
}
Update-MedProntoProgress $progress 1 'Node.js portatil...' 'Verificando cache (nao baixa de novo se ja existir).'

$nodeFolderName = "node-$NodeVersion-win-$Arch"
$nodeZipName = "$nodeFolderName.zip"
$nodeUrl = "https://nodejs.org/dist/$NodeVersion/$nodeZipName"
New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
$nodeZipPath = Join-Path $cacheDir $nodeZipName

try {
    Write-Host '[1/6] Node.js portatil...' -ForegroundColor Yellow
    if (Test-Path $nodeZipPath) {
        $sizeMB = [math]::Round((Get-Item $nodeZipPath).Length / 1MB, 1)
        Write-Host "      cache encontrado ($sizeMB MB), reaproveitando." -ForegroundColor Gray
    } else {
        Write-Host "      baixando $nodeUrl ..." -ForegroundColor Gray
        Set-MedProntoProgressBusy $progress 'Baixando Node.js...' $nodeUrl
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZipPath -UseBasicParsing
        $sizeMB = [math]::Round((Get-Item $nodeZipPath).Length / 1MB, 1)
        Write-Host "      ok ($sizeMB MB)." -ForegroundColor Gray
    }

    $staging = Join-Path $env:TEMP "medpronto-instalador-$(Get-Random)"
    New-Item -ItemType Directory -Path $staging | Out-Null

    Write-Host ''
    Write-Host '[2/6] Copiando projeto para staging...' -ForegroundColor Yellow
    Set-MedProntoProgressBusy $progress '[2/8] Copiando o projeto...' 'Montando a pasta temporaria do instalador.'
    Copy-ProjetoParaStaging -Root $root -Staging $staging -Progress $progress

    Write-Host ''
    Write-Host '[3/6] Extraindo Node.js portatil em .\node\ ...' -ForegroundColor Yellow
    Update-MedProntoProgress $progress 3 'Extraindo Node.js e tunel...' 'Do cache do computador, sem baixar de novo.'

    $nodeExtractTmp = Join-Path $staging '_node_extract_tmp'
    New-Item -ItemType Directory -Path $nodeExtractTmp | Out-Null
    Expand-Archive -Path $nodeZipPath -DestinationPath $nodeExtractTmp -Force

    $extractedDir = Join-Path $nodeExtractTmp $nodeFolderName
    if (-not (Test-Path $extractedDir)) {
        throw "estrutura do zip do Node.js inesperada. Esperado pasta '$nodeFolderName'."
    }
    $finalNodeDir = Join-Path $staging 'node'
    Move-Item -Path $extractedDir -Destination $finalNodeDir
    Remove-Item $nodeExtractTmp -Recurse -Force

    $nodeExe = Join-Path $finalNodeDir 'node.exe'
    $npmCmd  = Join-Path $finalNodeDir 'npm.cmd'
    if (-not (Test-Path $nodeExe)) { throw "node.exe nao encontrado em $finalNodeDir" }
    if (-not (Test-Path $npmCmd))  { throw "npm.cmd nao encontrado em $finalNodeDir" }

    & $nodeExe -v | Out-Host

    Write-Host ''
    Write-Host '[3.1/6] Preparando cloudflared (tunel remoto)...' -ForegroundColor Yellow
    $cfOk = Ensure-CloudflaredInDir -TargetDir $staging -CacheDir $cacheDir -AllowDownload
    if ($cfOk) {
        $cfMb = [math]::Round((Get-Item (Join-Path $staging 'bin\cloudflared.exe')).Length / 1MB, 1)
        Write-Host "      bin/cloudflared.exe incluido ($cfMb MB)." -ForegroundColor Gray
    } else {
        Write-Host '      AVISO: cloudflared nao entrou no zip (sem internet?). Tunel exige instalar com rede.' -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host '[4/6] Pre-instalando node_modules...' -ForegroundColor Yellow
    Write-Host '      compila better-sqlite3 com o Node bundled.' -ForegroundColor DarkGray
    Set-MedProntoProgressBusy $progress '[4/8] Instalando componentes npm...' 'Pode demorar na primeira vez. Depois usa o cache.'

    Push-Location $staging
    try {
        $oldPath = $env:PATH
        $oldNodeEnv = $env:NODE_ENV
        $env:PATH = "$finalNodeDir;$env:PATH"
        $env:NODE_ENV = 'development'
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $npmLine = "`"$npmCmd`" install --no-audit --no-fund --include=dev 2>&1"
            & cmd.exe /c $npmLine | ForEach-Object {
                Write-Host "      $_" -ForegroundColor DarkGray
                Set-MedProntoProgressDetail $progress "$_"
            }
            if ($LASTEXITCODE -ne 0) { throw "npm install falhou (codigo $LASTEXITCODE)" }
        } finally {
            $env:PATH = $oldPath
            if ($null -eq $oldNodeEnv) { Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue } else { $env:NODE_ENV = $oldNodeEnv }
            $ErrorActionPreference = $prevEAP
        }
    } finally {
        Pop-Location
    }

    $modulesCount = (Get-ChildItem -Path (Join-Path $staging 'node_modules') -Directory -ErrorAction SilentlyContinue).Count
    Write-Host "      node_modules instalado ($modulesCount pacotes de topo)." -ForegroundColor Gray

    Write-Host ''
    Write-Host '[5/6] Compilando para producao (frontend + backend)...' -ForegroundColor Yellow
    Set-MedProntoProgressBusy $progress '[5/8] Compilando o sistema...' 'Frontend e backend de producao.'
    Push-Location $staging
    try {
        $oldPath = $env:PATH
        $env:PATH = "$finalNodeDir;$env:PATH"
        foreach ($line in @(
            "`"$npmCmd`" run build -w backend 2>&1",
            "`"$npmCmd`" run build -w frontend 2>&1"
        )) {
            & cmd.exe /c $line | ForEach-Object {
                Write-Host "      $_" -ForegroundColor DarkGray
                Set-MedProntoProgressDetail $progress "$_"
            }
            if ($LASTEXITCODE -ne 0) { throw "build falhou (codigo $LASTEXITCODE)" }
        }
    } finally {
        $env:PATH = $oldPath
        Pop-Location
    }

    if (-not (Test-Path (Join-Path $staging 'frontend\dist\index.html'))) {
        throw 'frontend/dist/index.html nao encontrado apos build'
    }
    if (-not (Test-Path (Join-Path $staging 'backend\dist\index.js'))) {
        throw 'backend/dist/index.js nao encontrado apos build'
    }
    Write-Host '      build de producao OK.' -ForegroundColor Gray

    Write-Host ''
    Write-Host '[5.1/6] Removendo arquivos de desenvolvimento...' -ForegroundColor Yellow
    Update-MedProntoProgress $progress 6 'Limpando o pacote do cliente...' 'Sem docs, fontes nem ferramentas de desenvolvimento.'
    Remove-ClientDevFromStaging -Staging $staging
    Assert-ClientPayloadClean -Staging $staging
    Write-Host '      pacote cliente limpo (sem docs, fontes, ferramentas dev).' -ForegroundColor Gray

    Write-Host ''
    Write-Host '[6/6] Gerando MedPronto-instalacao-completa.exe e MedPronto-atualizacao.exe ...' -ForegroundColor Yellow
    $totalFiles = (Get-ChildItem -Path $staging -Recurse -File).Count
    Write-Host "      $totalFiles arquivos no staging (aguarde — pode levar alguns minutos)" -ForegroundColor DarkGray
    Set-MedProntoProgressBusy $progress '[7/8] Gerando os instaladores .exe...' "$totalFiles arquivos - a barra continua se movendo."

    $ver = Get-MedProntoVersion -Root $root
    $exePaths = @(Build-MedProntoClienteExes -Staging $staging -OutputDir $root -CacheDir $cacheDir -Version $ver -ModoCompactacao $ModoCompactacao -Progress $progress)
    if ($exePaths.Count -lt 2) {
        throw 'Os dois EXE nao foram gerados (MedPronto-instalacao-completa.exe e MedPronto-atualizacao.exe).'
    }
    foreach ($exe in $exePaths) {
        $exeMb = [math]::Round((Get-Item $exe).Length / 1MB, 1)
        Write-Host "      $exe ($exeMb MB)" -ForegroundColor Gray
    }

    Write-Host ''
    Write-Host '========================================' -ForegroundColor Green
    Write-Host " OK -- instaladores prontos" -ForegroundColor Green
    Write-Host '========================================' -ForegroundColor Green
    Write-Host ''
    foreach ($exe in $exePaths) {
        Write-Host "EXE: $exe" -ForegroundColor White
    }
    Write-Host "Node: $NodeVersion ($Arch) embutido" -ForegroundColor White
    Write-Host ''
    Write-Host 'PARA O CLIENTE:' -ForegroundColor Yellow
    Write-Host '  Primeira vez ........ MedPronto-instalacao-completa.exe' -ForegroundColor White
    Write-Host '  Ja tem o sistema .... MedPronto-atualizacao.exe' -ForegroundColor White
    Write-Host '  Baixa em qualquer pasta e executa.' -ForegroundColor White
    Write-Host ''
    $empacoteOk = $true
} finally {
    if ($progress) {
        if ($empacoteOk) {
            try { Update-MedProntoProgress $progress 8 'Concluido.' 'Instaladores prontos.' } catch { }
            Start-Sleep -Milliseconds 800
        }
        Close-MedProntoProgress $progress
        $progress = $null
    }
    if ($staging -and (Test-Path $staging)) {
        Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
}
