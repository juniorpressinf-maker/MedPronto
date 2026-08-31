param(
    [Parameter(Mandatory = $false)]
    [string]$InstallDir = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

$InstallDir = (Resolve-Path -LiteralPath $InstallDir).Path

try {
    $ws = New-Object -ComObject WScript.Shell
    $desktop = [Environment]::GetFolderPath('Desktop')

    $launcherVbs = Join-Path $InstallDir 'iniciar.vbs'
    if (-not (Test-Path -LiteralPath $launcherVbs)) {
        throw "Nao encontrei iniciar.vbs em $InstallDir"
    }

    $iconRef = 'shell32.dll,140'

    $shortcutPath = Join-Path $desktop 'MedPronto.lnk'
    $sc = $ws.CreateShortcut($shortcutPath)
    $sc.TargetPath = $launcherVbs
    $sc.WorkingDirectory = $InstallDir
    $sc.IconLocation = $iconRef
    $sc.Description = 'MedPronto - consultorio medico'
    $sc.WindowStyle = 7
    $sc.Save()
    Write-Host "      atalho criado: $shortcutPath" -ForegroundColor Green

    $stopBat = Join-Path $InstallDir 'parar.bat'
    if (Test-Path -LiteralPath $stopBat) {
        $stopShortcut = Join-Path $desktop 'MedPronto - parar.lnk'
        $sc2 = $ws.CreateShortcut($stopShortcut)
        $sc2.TargetPath = $stopBat
        $sc2.WorkingDirectory = $InstallDir
        $sc2.IconLocation = 'shell32.dll,131'
        $sc2.Description = 'Encerra o MedPronto'
        $sc2.WindowStyle = 1
        $sc2.Save()
        Write-Host "      atalho parar: $stopShortcut" -ForegroundColor Green
    }

    exit 0
} catch {
    Write-Host "      erro ao criar atalho: $($_.Exception.Message)" -ForegroundColor Yellow
    exit 1
}
