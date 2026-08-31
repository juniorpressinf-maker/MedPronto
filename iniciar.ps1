# MedPronto — wrapper do launcher (atalho via iniciar.vbs usa -Silent)
param(
    [switch]$Silent,
    [switch]$NoBrowser
)

$Root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$launcher = Join-Path $Root 'scripts\medpronto_launcher.ps1'

if (-not (Test-Path -LiteralPath $launcher)) {
    Write-Error "Launcher nao encontrado: $launcher"
    exit 1
}

& $launcher -Root $Root -Silent:$Silent -NoBrowser:$NoBrowser
exit $LASTEXITCODE
