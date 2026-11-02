# Traz o codigo da nuvem (GitHub) para este PC e recompila o MedPronto.
# Uso: powershell -File scripts\nuvem-para-pc.ps1 [-Root D:\MedPronto] [-Force]
param(
    [string]$Root = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = Split-Path -Parent $PSScriptRoot
} else {
    $Root = $Root.Trim().Trim('"').Trim("'").TrimEnd('\', '/')
}

function Log([string]$Msg) {
    Write-Host "[nuvem_para_pc] $Msg"
}

function Resolve-GitExe {
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    foreach ($p in @(
        "C:\Program Files\Git\cmd\git.exe",
        "C:\Program Files\Git\bin\git.exe",
        "C:\Program Files (x86)\Git\cmd\git.exe"
    )) {
        if (Test-Path -LiteralPath $p) { return $p }
    }
    return $null
}

function Invoke-Git {
    param([string[]]$GitArgs)
    $all = @("-c", "gc.auto=0", "-c", "maintenance.auto=false") + $GitArgs
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    # Saida do git so na tela: se for para o pipeline, vira parte do retorno e "$rc -ne 0" sempre da verdadeiro.
    & $script:GitExe @all 2>&1 | ForEach-Object { Write-Host "$_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    return $code
}

function Invoke-GitOut {
    param([string[]]$GitArgs)
    $all = @("-c", "gc.auto=0", "-c", "maintenance.auto=false") + $GitArgs
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = & $script:GitExe @all 2>&1 | Out-String
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    return @{ Code = $code; Text = $out.Trim() }
}

function Split-GitLines([string]$Text) {
    return @($Text -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Resolve-NpmCmd {
    param([string]$InstallDir)
    $portable = Join-Path $InstallDir "node\npm.cmd"
    if (Test-Path -LiteralPath $portable) { return $portable }
    $cmd = Get-Command npm -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    return $null
}

function Invoke-Npm {
    param([string]$Npm, [string]$NpmArgs, [string]$Etapa)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $line = '"' + $Npm + '" ' + $NpmArgs + ' 2>&1'
    & cmd.exe /c $line | ForEach-Object { Log "  $_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) {
        Write-Error "$Etapa falhou (codigo $code)."
        exit $code
    }
}

Log "Raiz: $Root"
Set-Location -LiteralPath $Root

$script:GitExe = Resolve-GitExe
if (-not $script:GitExe) {
    Write-Error "Git nao encontrado. Instale o Git for Windows e tente de novo."
    exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $Root ".git"))) {
    Write-Error "Esta pasta nao e um repositorio Git."
    exit 1
}

$env:GIT_TERMINAL_PROMPT = "0"

$branchOut = Invoke-GitOut @("rev-parse", "--abbrev-ref", "HEAD")
if ($branchOut.Code -ne 0) {
    Write-Error "Nao foi possivel ler o branch Git."
    exit 1
}
$branch = $branchOut.Text
Log "Branch: $branch"

if ($branch -ne "master" -and $branch -ne "main") {
    Log "AVISO: este PC nao esta em master/main (esta em $branch). Vou puxar origin/$branch."
}

$beforeOut = Invoke-GitOut @("rev-parse", "--short", "HEAD")
$before = $beforeOut.Text
Log "Commit neste PC (antes): $before"

Log "Buscando origin (git fetch)..."
$fetchRc = Invoke-Git @("fetch", "origin")
if ($fetchRc -ne 0) {
    Write-Error "git fetch falhou. Confira internet e login do GitHub."
    exit 1
}

$remoteBranch = "origin/$branch"
if ((Invoke-GitOut @("rev-parse", "--verify", "--quiet", $remoteBranch)).Code -ne 0) {
    $alternativo = if ($branch -eq "main") { "master" } else { "main" }
    if ((Invoke-GitOut @("rev-parse", "--verify", "--quiet", "origin/$alternativo")).Code -ne 0) {
        Write-Error "Nao achei origin/$branch nem origin/$alternativo no GitHub."
        exit 1
    }
    $branch = $alternativo
    $remoteBranch = "origin/$alternativo"
    Log "Branch remoto nao existe; usando $remoteBranch."
}

$remoteShort = (Invoke-GitOut @("rev-parse", "--short", $remoteBranch)).Text
Log "Commit na nuvem ($remoteBranch): $remoteShort"

$behindOut = Invoke-GitOut @("rev-list", "--count", "HEAD..$remoteBranch")
$behind = 0
if ($behindOut.Code -eq 0 -and $behindOut.Text -match '^\d+$') {
    $behind = [int]$behindOut.Text
}
Log "Este PC esta $behind commit(s) atrasado em relacao a nuvem."

$incoming = @()
if ($behind -gt 0) {
    Log "O que vai entrar:"
    $null = Invoke-Git @("log", "--oneline", "HEAD..$remoteBranch")
    $incoming = Split-GitLines (Invoke-GitOut @("diff", "--name-only", "HEAD", $remoteBranch)).Text
}

if ($behind -gt 0 -or $Force) {
    $parar = Join-Path $PSScriptRoot "parar-medpronto.ps1"
    if (Test-Path -LiteralPath $parar) {
        Log "Parando MedPronto (libera arquivos para Git, npm e build)..."
        try {
            & $parar -InstallDir $Root | Out-Null
        } catch {
            Log "AVISO: nao deu para parar tudo; seguindo mesmo assim."
        }
        Start-Sleep -Seconds 2
    }
}

$stashed = $false
$conflito = @()
$stashName = "nuvem_para_pc $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
if ($behind -gt 0) {
    $dirty = @(Split-GitLines (Invoke-GitOut @("status", "--porcelain", "-uno")).Text | ForEach-Object {
        $p = $_ -replace '^\s*[A-Z?!]{1,2}\s+', ''
        if ($p -match ' -> ') { $p = ($p -split ' -> ')[-1] }
        $p.Trim('"')
    })
    # Arquivo "M" so por fim de linha (CRLF) nao e alteracao: nao vai para o stash (o pop falharia).
    $real = @($dirty | Where-Object {
        -not [string]::IsNullOrWhiteSpace((Invoke-GitOut @("diff", "HEAD", "--ignore-cr-at-eol", "--", $_)).Text)
    })
    $soFimDeLinha = @($dirty | Where-Object { $real -notcontains $_ })
    foreach ($f in @($soFimDeLinha | Where-Object { $incoming -contains $_ })) {
        Log "Ignorando $f (so fim de linha; a nuvem traz versao nova)."
        $null = Invoke-Git @("checkout", "--", $f)
    }
    $conflito = @($real | Where-Object { $incoming -contains $_ })
    if ($real.Count -gt 0) {
        Log "Alteracoes locais suas (ficam como estao): $($real -join ', ')"
    }
    if ($conflito.Count -gt 0) {
        Log "Estes arquivos tambem mudaram na nuvem - guardando so eles com git stash: $($conflito -join ', ')"
        $stashRc = Invoke-Git (@("stash", "push", "-m", $stashName, "--") + $conflito)
        if ($stashRc -ne 0) {
            Write-Error "Nao consegui guardar as alteracoes locais (git stash). Resolva o Git e tente de novo."
            exit 1
        }
        $stashed = $true
    }

    Log "Atualizando (git merge --ff-only $remoteBranch)..."
    $mergeRc = Invoke-Git @("merge", "--ff-only", $remoteBranch)
    if ($mergeRc -ne 0) {
        if ($stashed) { $null = Invoke-Git @("stash", "pop") }
        Write-Error "Nao deu para atualizar em linha reta (este PC tem commit que a nuvem nao tem, ou arquivo travado). Feche CMD/Cursor se aparecer 'Unlink of file' (responda n) e rode de novo."
        exit 1
    }
} else {
    Log "Nao ha commit novo no GitHub neste momento. Nada para puxar."
}

if ($stashed) {
    Log "Devolvendo alteracoes locais (git stash pop)..."
    $popRc = Invoke-Git @("stash", "pop")
    if ($popRc -ne 0) {
        Write-Error "Suas alteracoes e as da nuvem mexeram nas mesmas linhas de: $($conflito -join ', '). O codigo da nuvem JA foi baixado; suas alteracoes estao guardadas em git stash list (nome: $stashName). Peca ajuda para juntar antes de rodar de novo."
        exit 1
    }
}

$after = (Invoke-GitOut @("rev-parse", "--short", "HEAD")).Text
$nowRemote = (Invoke-GitOut @("rev-parse", "--short", $remoteBranch)).Text
Log "Commit neste PC (agora): $after"
Log "Commit na nuvem (agora): $nowRemote"

$aheadOut = Invoke-GitOut @("rev-list", "--count", "$remoteBranch..HEAD")
$ahead = 0
if ($aheadOut.Code -eq 0 -and $aheadOut.Text -match '^\d+$') {
    $ahead = [int]$aheadOut.Text
}
if ($after -ne $nowRemote) {
    if ($ahead -gt 0 -and (Invoke-GitOut @("rev-list", "--count", "HEAD..$remoteBranch")).Text -eq "0") {
        Log "AVISO: este PC tem $ahead commit(s) que ainda nao foram para a nuvem (git push pendente). Tudo da nuvem ja esta aqui."
    } else {
        Write-Error "Este PC AINDA nao esta no mesmo commit da nuvem (PC=$after nuvem=$nowRemote). Nao confie neste resultado; rode de novo."
        exit 1
    }
}

if ($before -eq $after -and -not $Force) {
    Log "Git ja estava igual a nuvem. Nada para compilar."
    Log "Pronto. PC=$after nuvem=$nowRemote."
    exit 0
}

Log "Codigo novo ($before -> $after). Preparando o sistema..."

$nodeDir = Join-Path $Root "node"
if (Test-Path -LiteralPath (Join-Path $nodeDir "node.exe")) {
    $env:PATH = "$nodeDir;$env:PATH"
    Log "Node portatil: .\node\"
}

$npm = Resolve-NpmCmd -InstallDir $Root
if (-not $npm) {
    Write-Error "npm nao encontrado. Use o Node portatil em .\node ou Instalar MedPronto."
    exit 1
}

$depsMudaram = @($incoming | Where-Object { $_ -match '(^|/)package(-lock)?\.json$' }).Count -gt 0
$semModulos = -not (Test-Path -LiteralPath (Join-Path $Root "node_modules"))
if ($depsMudaram -or $semModulos) {
    Log "Dependencias mudaram - npm install..."
    Invoke-Npm -Npm $npm -NpmArgs "install --no-audit --no-fund" -Etapa "npm install"
}

Log "Compilando backend + frontend..."
Invoke-Npm -Npm $npm -NpmArgs "run build" -Etapa "Compilacao"
Log "Compilacao OK."

# db-migrate.mjs usa backend\dist: so depois do build.
Log "Migracoes do banco (db:migrate)..."
Invoke-Npm -Npm $npm -NpmArgs "run db:migrate" -Etapa "db:migrate"

Log "Pronto. PC=$after nuvem=$nowRemote. Abra o MedPronto de novo pelo atalho."
exit 0
