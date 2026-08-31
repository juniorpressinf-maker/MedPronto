# Funcoes compartilhadas: empacotar-instalador.ps1 e instalador (Instalar / Atualizar)
# Regra: pacote do cliente = uso em producao, sem ferramentas de desenvolvimento.

function Get-MedProntoVersion {
    param([string]$Root)
    $pkgPath = Join-Path $Root 'package.json'
    if (-not (Test-Path $pkgPath)) { return '0.0.0' }
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    return [string]$pkg.version
}

function Get-VendorOnlyPaths {
    # Ferramentas do fornecedor — NUNCA incluir no zip do cliente.
    return @{
        Dirs = @(
            'ferramentas'
        )
        Files = @(
            'Gerar Licenca.bat',
            'scripts\gerar-licenca.mjs'
        )
    }
}

function Get-ClientDevPaths {
    # Documentacao, codigo-fonte e utilitarios de desenvolvimento — nao vao ao cliente.
    return @{
        Dirs = @(
            'docs',
            '.cursor',
            'testsprite_tests',
            'frontend\src',
            'backend\src'
        )
        # Excluir ja na copia para staging (fontes ficam de fora ate o build terminar).
        CopyExcludeDirs = @(
            'docs',
            '.cursor',
            'testsprite_tests'
        )
        CopyExcludeFiles = @(
            'README.md',
            'PLANO.md',
            '.gitignore',
            '.env',
            '.env.local',
            'Compilar MedPronto.bat',
            'preparar-teste.bat',
            'zerar-base.bat',
            'reset-acesso.bat',
            'Empacotar Instalador.bat',
            'empacotar-instalador.ps1',
            'medpronto-instalador-win.zip',
            'MedPronto-Setup.exe',
            'MedPronto-instalacao-completa.exe',
            'MedPronto-atualizacao.exe',
            'instalacao-completa.exe',
            'atualizado.exe',
            'atualizacao.exe',
            'medpronto-instalador-offline-win.zip',
            'agenda-instalador-offline-mac.zip',
            'agenda-instalador-offline.zip',
            'ULTIMO-ERRO.txt',
            'ULTIMO-ERRO-EMPACOTE.txt',
            'is-node-lts.mjs'
        )
        Files = @(
            'README.md',
            'PLANO.md',
            '.gitignore',
            '.env',
            '.env.local',
            'Compilar MedPronto.bat',
            'preparar-teste.bat',
            'zerar-base.bat',
            'reset-acesso.bat',
            'Empacotar Instalador.bat',
            'empacotar-instalador.ps1',
            'medpronto-instalador-win.zip',
            'MedPronto-Setup.exe',
            'MedPronto-instalacao-completa.exe',
            'MedPronto-atualizacao.exe',
            'instalacao-completa.exe',
            'atualizado.exe',
            'atualizacao.exe',
            'medpronto-instalador-offline-win.zip',
            'agenda-instalador-offline-mac.zip',
            'agenda-instalador-offline.zip',
            'ULTIMO-ERRO.txt',
            'ULTIMO-ERRO-EMPACOTE.txt',
            'is-node-lts.mjs',
            'frontend\index.html',
            'frontend\vite.config.ts',
            'frontend\tsconfig.json',
            'frontend\tsconfig.app.json',
            'frontend\tsconfig.node.json',
            'frontend\tailwind.config.js',
            'frontend\postcss.config.js',
            'frontend\eslint.config.js',
            'backend\tsconfig.json'
        )
        ScriptFiles = @(
            'scripts\baixar-node-portatil.ps1',
            'scripts\baixar-cloudflared.ps1',
            'scripts\gerar-contra-senha.mjs',
            'scripts\zerar-base.mjs',
            'scripts\reset-acesso.mjs'
        )
        BackendScriptPatterns = @('test-*.ts', 'diag-*.ts', 'preparar-teste.ts')
    }
}

function Build-EmpacotarExcludeLists {
    param([string]$Root)

    $dev = Get-ClientDevPaths
    $vendor = Get-VendorOnlyPaths

    $excludeDirs = @(
        'node_modules',
        'node',
        'data',
        'data_restore_pending',
        '.git',
        '.cache',
        'logs',
        'temp',
        'dist',
        'backend\data',
        'backend\dist',
        'frontend\dist',
        '.npm-cache'
    ) + $dev.CopyExcludeDirs + $vendor.Dirs

    Get-ChildItem -Path $Root -Directory -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -like 'data_pre_restore_*' -or
            $_.Name -like 'node.bak-inno*' -or
            $_.Name -like 'node_modules.bak-inno*' -or
            $_.Name -like 'bin.bak-inno*'
        } |
        ForEach-Object { $excludeDirs += $_.Name }

    $excludeFiles = @(
        '*.zip',
        '*.log',
        '*.sqlite'
    ) + $dev.CopyExcludeFiles + $vendor.Files

    return @{
        Dirs  = $excludeDirs
        Files = $excludeFiles
    }
}

function Get-ClientPayloadExcludeLists {
    param([string]$Root = '')

    $dev = Get-ClientDevPaths
    $vendor = Get-VendorOnlyPaths

    # Instalar / Atualizar: preserva dados locais; nao copia lixo de desenvolvimento.
    $excludeDirs = @(
        'data',
        'data_restore_pending',
        'backups',
        'logs',
        'temp',
        '.git',
        '.cache',
        '.npm-cache'
    ) + $dev.Dirs + $vendor.Dirs

    if (-not [string]::IsNullOrWhiteSpace($Root) -and (Test-Path -LiteralPath $Root)) {
        Get-ChildItem -Path $Root -Directory -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Name -like 'data_pre_restore_*' -or
                $_.Name -like 'node.bak-inno*' -or
                $_.Name -like 'node_modules.bak-inno*' -or
                $_.Name -like 'bin.bak-inno*'
            } |
            ForEach-Object { $excludeDirs += $_.Name }
    }

    $excludeFiles = @('.env', 'edicao.txt') + $dev.Files + $vendor.Files

    return @{
        Dirs  = $excludeDirs
        Files = $excludeFiles
    }
}

function Remove-VendorOnlyFromStaging {
    param([string]$Staging)

    $vendor = Get-VendorOnlyPaths
    foreach ($dir in $vendor.Dirs) {
        $p = Join-Path $Staging $dir
        if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
    }
    foreach ($file in $vendor.Files) {
        $p = Join-Path $Staging $file
        if (Test-Path $p) { Remove-Item $p -Force -ErrorAction SilentlyContinue }
    }
}

function Remove-ClientDevFromStaging {
    param([string]$Staging)

    $dev = Get-ClientDevPaths

    foreach ($dir in $dev.Dirs) {
        $p = Join-Path $Staging $dir
        if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
    }
    foreach ($file in $dev.Files) {
        $p = Join-Path $Staging $file
        if (Test-Path $p) { Remove-Item $p -Force -ErrorAction SilentlyContinue }
    }
    foreach ($file in $dev.ScriptFiles) {
        $p = Join-Path $Staging $file
        if (Test-Path $p) { Remove-Item $p -Force -ErrorAction SilentlyContinue }
    }

    $backendScripts = Join-Path $Staging 'backend\scripts'
    if (Test-Path -LiteralPath $backendScripts) {
        foreach ($pattern in $dev.BackendScriptPatterns) {
            Get-ChildItem -Path $backendScripts -Filter $pattern -File -ErrorAction SilentlyContinue |
                ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }
        }
    }

    Get-ChildItem -Path $Staging -Recurse -File -Filter '*.tsbuildinfo' -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }

    Remove-VendorOnlyFromStaging -Staging $Staging
}

function Assert-ClientPayloadClean {
    param([string]$Staging)

    $checks = @(
        @{ Path = 'docs'; Label = 'docs/' },
        @{ Path = 'frontend\src'; Label = 'frontend/src/' },
        @{ Path = 'backend\src'; Label = 'backend/src/' },
        @{ Path = 'ferramentas'; Label = 'ferramentas/' },
        @{ Path = '.cursor'; Label = '.cursor/' }
    )
    foreach ($c in $checks) {
        $p = Join-Path $Staging $c.Path
        if (Test-Path -LiteralPath $p) {
            throw "$($c.Label) nao pode ir no pacote do cliente"
        }
    }

    $dev = Get-ClientDevPaths
    foreach ($file in $dev.Files) {
        if ($file -like '*.*' -and $file -notlike '*\*') {
            $p = Join-Path $Staging $file
            if (Test-Path -LiteralPath $p) {
                throw "$file nao pode ir no pacote do cliente"
            }
        }
    }
}

function Clean-StagingJunk {
    param([string]$Staging)

    Get-ChildItem -Path $Staging -Directory -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -like 'data_pre_restore_*' -or
            $_.Name -eq 'data_restore_pending' -or
            $_.Name -eq 'data'
        } |
        ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

    Get-ChildItem -Path $Staging -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Extension -in '.zip', '.log' -or
            $_.Name -like 'empacotar*'
        } |
        ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }

    Remove-ClientDevFromStaging -Staging $Staging
}

function Copy-ProjetoParaStaging {
    param(
        [string]$Root,
        [string]$Staging,
        $Progress = $null
    )

    $ex = Build-EmpacotarExcludeLists -Root $Root
    Write-Host "      pastas excluidas: $($ex.Dirs.Count)" -ForegroundColor DarkGray

    $robocopyArgs = @($Root, $Staging, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    if ($ex.Dirs.Count -gt 0)  { $robocopyArgs += '/XD'; $robocopyArgs += $ex.Dirs }
    if ($ex.Files.Count -gt 0) { $robocopyArgs += '/XF'; $robocopyArgs += $ex.Files }
    if ($Progress -and (Get-Command Invoke-ProcessWithUiPulse -ErrorAction SilentlyContinue)) {
        $rc = Invoke-ProcessWithUiPulse -FilePath 'robocopy.exe' -ArgumentList $robocopyArgs -Progress $Progress -BusyText 'Copiando arquivos do projeto'
    } else {
        & robocopy @robocopyArgs | Out-Null
        $rc = $LASTEXITCODE
    }
    if ($rc -ge 8) { throw "robocopy falhou com codigo $rc" }

    # Mantem fontes para o build; limpeza completa vem em Remove-ClientDevFromStaging apos compilar.
    Get-ChildItem -Path $Staging -Directory -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -like 'data_pre_restore_*' -or
            $_.Name -eq 'data_restore_pending' -or
            $_.Name -eq 'data'
        } |
        ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

    Get-ChildItem -Path $Staging -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Extension -in '.zip', '.log' -or
            $_.Name -like 'empacotar*'
        } |
        ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }

    Remove-VendorOnlyFromStaging -Staging $Staging
}

function Test-WindowsExeFile {
    param([string]$Path, [int]$MinBytes = 1000000)
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    $item = Get-Item -LiteralPath $Path
    if ($item.Length -lt $MinBytes) { return $false }
    $fs = [IO.File]::OpenRead($Path)
    try {
        $b0 = $fs.ReadByte()
        $b1 = $fs.ReadByte()
        return ($b0 -eq 0x4D -and $b1 -eq 0x5A) # MZ
    } finally {
        $fs.Close()
    }
}

function Get-InnoSetupCompiler {
    param([string]$CacheDir)
    $candidates = @(
        (Join-Path $CacheDir 'innosetup\ISCC.exe'),
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    return ''
}

function Ensure-InnoSetupCompiler {
    param([string]$CacheDir)
    $existing = Get-InnoSetupCompiler -CacheDir $CacheDir
    if ($existing) { return $existing }

    $dest = Join-Path $CacheDir 'innosetup'
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    $setup = Join-Path $CacheDir 'innosetup-installer.exe'
    $urls = @(
        'https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe',
        'https://files.jrsoftware.org/is/6/innosetup-6.7.3.exe'
    )

    $ok = Test-WindowsExeFile $setup
    if (-not $ok) {
        if (Test-Path -LiteralPath $setup) {
            Remove-Item -LiteralPath $setup -Force -ErrorAction SilentlyContinue
        }
        $ProgressPreference = 'SilentlyContinue'
        $lastErr = ''
        foreach ($url in $urls) {
            Write-Host "      baixando Inno Setup: $url" -ForegroundColor Gray
            try {
                Invoke-WebRequest -Uri $url -OutFile $setup -UseBasicParsing
                if (Test-WindowsExeFile $setup) { $ok = $true; break }
                $lastErr = "arquivo baixado invalido ($url, $((Get-Item $setup -ErrorAction SilentlyContinue).Length) bytes)"
            } catch {
                $lastErr = $_.Exception.Message
            }
        }
        if (-not $ok) {
            throw "Nao foi possivel baixar o Inno Setup. $lastErr"
        }
    }

    Write-Host "      instalando compilador Inno em $dest ..." -ForegroundColor Gray
    $p = Start-Process -FilePath $setup -ArgumentList @(
        '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART',
        "/DIR=$dest"
    ) -Wait -PassThru
    if ($p.ExitCode -ne 0 -and -not (Test-Path -LiteralPath (Join-Path $dest 'ISCC.exe'))) {
        throw "Instalacao do Inno Setup falhou (codigo $($p.ExitCode))"
    }
    $iscc = Get-InnoSetupCompiler -CacheDir $CacheDir
    if (-not $iscc) { throw 'ISCC.exe nao encontrado apos instalar o Inno Setup.' }
    return $iscc
}

function Write-MedProntoInnoScript {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('completa', 'atualizacao')]
        [string]$Kind,
        [string]$Staging,
        [string]$OutputDir,
        [string]$Version,
        [string]$IssPath,
        [ValidateSet('rapido', 'otimizado')]
        [string]$ModoCompactacao = 'rapido'
    )
    $stagingIss = $Staging -replace '\\', '/'
    $outputIss = $OutputDir -replace '\\', '/'
    $ver = ($Version -replace '[^\d\.]', '')
    if ([string]::IsNullOrWhiteSpace($ver)) { $ver = '0.1.0' }
    $compression = if ($ModoCompactacao -eq 'otimizado') { 'lzma2' } else { 'lzma2/fast' }

    if ($Kind -eq 'completa') {
        $appName = 'MedPronto - Instalacao completa'
        $appId = '{{C1A90E22-4B7D-4F18-9E6A-7B2C4D8E1A01}}'
        $outName = 'MedPronto-instalacao-completa'
        $scriptName = 'instalar-cliente.ps1'
        $welcome = 'Instalacao NOVA do MedPronto.%n%nNa proxima tela voce escolhe a pasta. Nenhum arquivo e copiado ate voce confirmar.%n%nSe a pasta ja existir, o assistente avisa os riscos e pede confirmacao para instalar por cima. Instalacao completa APAGA pacientes e consultas dessa pasta. Para manter a clinica, use MedPronto-atualizacao.exe.'
        $dirWarn = 'no'
        $usePrevDir = 'no'
        $installingLabel = 'Instalando o MedPronto. Aguarde - nao feche esta janela.'
        $extractLabel = 'Copiando arquivos para a pasta de instalacao...'
        $runStatus = 'Configurando banco de dados, atalhos e Windows...'
        $finishedLabel = 'O MedPronto foi instalado. Use o atalho na Area de Trabalho para abrir.'
        $ready = 'Nenhum arquivo foi copiado ainda. Clique em Instalar. Se a pasta ja tiver o MedPronto, os dados da clinica serao apagados so depois da ultima confirmacao.'
        $dirCheck = @"
  AppDir := RemoveBackslash(WizardForm.DirEdit.Text);
  if AppDir = '' then
    Exit;
  if CurPageID = wpSelectDir then
  begin
    if FileExists(AppDir + '\data\medpronto.db') then
    begin
      if WizardSilent then
      begin
        Result := False;
        Exit;
      end;
      Result := MsgBox('ATENCAO: o MedPronto JA esta nesta pasta.'#13#10#13#10 + AppDir + #13#10#13#10'Instalar por cima com instalacao completa APAGA pacientes, consultas, exames, agenda e configuracoes.'#13#10#13#10'Para MANTER os dados, clique em Nao e use MedPronto-atualizacao.exe.'#13#10#13#10'Continuar nesta pasta? (ainda ha uma ultima confirmacao antes de copiar.)', mbError, MB_YESNO or MB_DEFBUTTON2) = IDYES;
    end
    else if DirExists(AppDir) then
    begin
      if not WizardSilent then
        Result := MsgBox('Esta pasta JA existe.'#13#10#13#10 + AppDir + #13#10#13#10'A instalacao completa grava por cima dos arquivos do MedPronto que estiverem aqui.'#13#10#13#10'Se houver clinica nesta pasta, os dados serao apagados depois da ultima confirmacao.'#13#10#13#10'Para manter pacientes e consultas, use MedPronto-atualizacao.exe.'#13#10#13#10'Usar esta pasta mesmo assim?', mbConfirmation, MB_YESNO) = IDYES;
    end;
  end;
  if CurPageID = wpReady then
  begin
    if WizardSilent then
    begin
      if FileExists(AppDir + '\data\medpronto.db') then
        Result := False;
      Exit;
    end;
    if FileExists(AppDir + '\data\medpronto.db') then
      Result := MsgBox('ULTIMA CONFIRMACAO'#13#10#13#10'Instalar POR CIMA e APAGAR a clinica em:'#13#10 + AppDir + #13#10#13#10'Pacientes, consultas, exames, agenda e configuracoes serao removidos. O programa sera instalado do zero.'#13#10#13#10'Um backup e gravado em backups antes de apagar.'#13#10#13#10'Para manter os dados, clique em Nao e use MedPronto-atualizacao.exe.'#13#10#13#10'Apagar os dados e instalar por cima?', mbError, MB_YESNO or MB_DEFBUTTON2) = IDYES
    else if DirExists(AppDir) then
      Result := MsgBox('Instalar o MedPronto POR CIMA desta pasta?'#13#10#13#10 + AppDir + #13#10#13#10'A pasta ja existe. Arquivos do sistema serao substituidos. Dados de clinica, se existirem, serao apagados.'#13#10#13#10'Nenhum arquivo sera copiado se voce clicar em Nao.', mbConfirmation, MB_YESNO) = IDYES
    else
      Result := MsgBox('Instalar o MedPronto nesta pasta?'#13#10#13#10 + AppDir + #13#10#13#10'Nenhum arquivo sera copiado se voce clicar em Nao ou Cancelar.', mbConfirmation, MB_YESNO) = IDYES;
  end;
"@
    } else {
        $appName = 'MedPronto - Atualizacao'
        $appId = '{{C1A90E22-4B7D-4F18-9E6A-7B2C4D8E1A01}}'
        $outName = 'MedPronto-atualizacao'
        $scriptName = 'atualizar-cliente.ps1'
        $welcome = 'Atualizacao do MedPronto ja instalado.%n%nNa proxima tela voce confirma a pasta da clinica. Nenhum arquivo e copiado ate voce autorizar.%n%nPacientes e consultas permanecem. Para primeiro uso neste computador, use MedPronto-instalacao-completa.exe.'
        $dirWarn = 'no'
        $usePrevDir = 'yes'
        $installingLabel = 'Atualizando o MedPronto. Aguarde - nao feche esta janela.'
        $extractLabel = 'Atualizando arquivos do sistema (dados da clinica preservados)...'
        $runStatus = 'Aplicando banco de dados, atalhos e registro do Windows...'
        $finishedLabel = 'Atualizacao concluida. Pacientes e consultas foram preservados. Use o atalho MedPronto para abrir.'
        $ready = 'Nenhum arquivo foi copiado ainda. Clique em Instalar para atualizar a pasta abaixo. Pacientes e consultas serao mantidos.'
        $dirCheck = @"
  AppDir := RemoveBackslash(WizardForm.DirEdit.Text);
  if AppDir = '' then
    Exit;
  if CurPageID = wpSelectDir then
  begin
    if not FileExists(AppDir + '\data\medpronto.db') then
    begin
      MsgBox('Esta pasta nao tem o MedPronto instalado.'#13#10#13#10 + AppDir + #13#10#13#10'Nenhum arquivo sera copiado.'#13#10#13#10'Escolha a pasta da clinica (ex.: C:\MedPronto) ou use MedPronto-instalacao-completa.exe no computador novo.', mbError, MB_OK);
      Result := False;
    end;
  end;
  if CurPageID = wpReady then
  begin
    if not FileExists(AppDir + '\data\medpronto.db') then
    begin
      MsgBox('Esta pasta nao tem o MedPronto instalado.'#13#10#13#10 + AppDir + #13#10#13#10'Nenhum arquivo sera copiado.'#13#10#13#10'Escolha a pasta da clinica (ex.: C:\MedPronto) ou use MedPronto-instalacao-completa.exe no computador novo.', mbError, MB_OK);
      Result := False;
    end
    else if not WizardSilent then
      Result := MsgBox('Atualizar o MedPronto nesta pasta?'#13#10#13#10 + AppDir + #13#10#13#10'Pacientes e consultas serao mantidos.'#13#10#13#10'Nenhum arquivo sera copiado se voce clicar em Nao.', mbConfirmation, MB_YESNO) = IDYES;
  end;
"@
    }

    $iss = @"
#define MyAppName "$appName"
#define MyAppVersion "$ver"
#define StagingDir "$stagingIss"

[Setup]
AppId=$appId
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=MedPronto
AppMutex=MedProntoPackExe
DefaultDirName={sd}\MedPronto
DefaultGroupName=MedPronto
DisableDirPage=no
DisableProgramGroupPage=yes
DisableReadyPage=no
DisableFinishedPage=no
DisableWelcomePage=no
AlwaysShowDirOnReadyPage=yes
CreateAppDir=yes
Uninstallable=yes
UsePreviousAppDir=$usePrevDir
DirExistsWarning=$dirWarn
OutputDir=$outputIss
OutputBaseFilename=$outName
Compression=$compression
SolidCompression=no
LZMAUseSeparateProcess=yes
WizardStyle=modern
WizardSizePercent=120
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force
CloseApplicationsFilter=*.exe,*.dll,*.node
RestartApplications=no
SetupLogging=yes
UninstallDisplayName=MedPronto

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
WelcomeLabel2=$welcome
ReadyLabel1=$ready
InstallingLabel=$installingLabel
StatusExtractFiles=$extractLabel
FinishedLabel=$finishedLabel
ButtonInstall=Instalar
ButtonFinish=Concluir

[Tasks]
Name: "desktopicon"; Description: "Criar atalhos na Area de Trabalho"; GroupDescription: "Atalhos:"; Flags: checkedonce

[Files]
Source: "{#StagingDir}\scripts\inno-prepare.ps1"; DestDir: "{tmp}"; Flags: dontcopy
Source: "{#StagingDir}\scripts\instalador-lib.ps1"; DestDir: "{tmp}"; Flags: dontcopy
Source: "{#StagingDir}\scripts\parar-medpronto.ps1"; DestDir: "{tmp}"; Flags: dontcopy
Source: "{#StagingDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "data\*;.env;logs\*;backups\*;node.bak-inno*;node_modules.bak-inno*;bin.bak-inno*"

[Icons]
Name: "{group}\MedPronto"; Filename: "{app}\iniciar.vbs"; WorkingDir: "{app}"
Name: "{group}\Parar MedPronto"; Filename: "{app}\parar.bat"; WorkingDir: "{app}"
Name: "{autodesktop}\MedPronto"; Filename: "{app}\iniciar.vbs"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{autodesktop}\MedPronto - parar"; Filename: "{app}\parar.bat"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\iniciar.vbs"; Description: "Abrir o MedPronto agora"; Flags: nowait postinstall skipifsilent shellexec unchecked

[Code]
function NextButtonClick(CurPageID: Integer): Boolean;
var
  AppDir: String;
begin
  Result := True;
  if (CurPageID <> wpSelectDir) and (CurPageID <> wpReady) then
    Exit;
$dirCheck
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  Params: String;
  AppDir: String;
  LogPath: String;
  LogAnsi: AnsiString;
  LogWide: String;
  Stamp: String;
begin
  Result := '';
  NeedsRestart := False;
  AppDir := RemoveBackslash(WizardForm.DirEdit.Text);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM node.exe /T', ExpandConstant('{sd}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM cloudflared.exe /T', ExpandConstant('{sd}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(2000);
  LogPath := ExpandConstant('{tmp}\inno-prepare.log');
  ExtractTemporaryFile('inno-prepare.ps1');
  ExtractTemporaryFile('instalador-lib.ps1');
  ExtractTemporaryFile('parar-medpronto.ps1');
  Params := '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + ExpandConstant('{tmp}\inno-prepare.ps1') + '" -LibPath "' + ExpandConstant('{tmp}\instalador-lib.ps1') + '" -Kind $Kind -InstallDir "' + AppDir + '" -LogPath "' + LogPath + '"';
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Params, ExpandConstant('{tmp}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    Result := 'Nao foi possivel preparar a pasta. Nenhum arquivo foi copiado.';
    Exit;
  end;
  if ResultCode <> 0 then
  begin
    Result := 'Nao foi possivel preparar a pasta. Nenhum arquivo foi copiado.';
    if LoadStringFromFile(LogPath, LogAnsi) then
    begin
      LogWide := Utf8Decode(LogAnsi);
      Result := Result + #13#10#13#10 + Trim(LogWide);
    end;
    Exit;
  end;
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM node.exe /T', ExpandConstant('{sd}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(1000);
  Stamp := GetDateTimeString('yyyymmddhhnnss', #0, #0);
  Exec(ExpandConstant('{cmd}'), '/c if exist "' + AppDir + '\node" move /Y "' + AppDir + '\node" "' + AppDir + '\node.bak-inno-' + Stamp + '"', ExpandConstant('{sd}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{cmd}'), '/c if exist "' + AppDir + '\node_modules" move /Y "' + AppDir + '\node_modules" "' + AppDir + '\node_modules.bak-inno-' + Stamp + '"', ExpandConstant('{sd}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{cmd}'), '/c if exist "' + AppDir + '\bin" move /Y "' + AppDir + '\bin" "' + AppDir + '\bin.bak-inno-' + Stamp + '"', ExpandConstant('{sd}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  Params: String;
  AppDir: String;
begin
  if CurStep <> ssPostInstall then
    Exit;
  AppDir := RemoveBackslash(WizardForm.DirEdit.Text);
  WizardForm.StatusLabel.Caption := '$runStatus';
  WizardForm.FilenameLabel.Caption := 'Uma janela de progresso indica cada etapa. Nao feche.';
  Params := '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + AppDir + '\scripts\$scriptName" -PosInno -NoGui -PayloadDir "' + AppDir + '" -InstallDir "' + AppDir + '"';
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Params, AppDir, SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    MsgBox('Nao foi possivel configurar o MedPronto.', mbError, MB_OK);
    Exit;
  end;
  if ResultCode <> 0 then
    MsgBox('Os arquivos foram copiados, mas a configuracao nao terminou (codigo ' + IntToStr(ResultCode) + '). Veja a pasta logs na instalacao.', mbError, MB_OK);
end;
"@
    $codeOnly = $iss.Substring($iss.IndexOf('[Code]'))
    if ($codeOnly -match '\{app\}') {
        throw 'Erro interno do empacote: o script do assistente nao pode usar {app} (quebra ao clicar Avancar na primeira tela).'
    }
    [IO.File]::WriteAllText($IssPath, $iss, (New-Object System.Text.UTF8Encoding $true))
}

function Build-MedProntoClienteExe {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('completa', 'atualizacao')]
        [string]$Kind,
        [string]$Staging,
        [string]$OutputDir,
        [string]$CacheDir,
        [string]$Version,
        [string]$Iscc,
        [ValidateSet('rapido', 'otimizado')]
        [string]$ModoCompactacao = 'rapido',
        $Progress = $null
    )
    $outName = if ($Kind -eq 'completa') { 'MedPronto-instalacao-completa.exe' } else { 'MedPronto-atualizacao.exe' }
    $tmpOut = Join-Path $env:TEMP "medpronto-exe-$Kind"
    New-Item -ItemType Directory -Force -Path $tmpOut | Out-Null
    $issPath = Join-Path $env:TEMP "medpronto-$Kind-$(Get-Random).iss"
    Write-MedProntoInnoScript -Kind $Kind -Staging $Staging -OutputDir $tmpOut -Version $Version -IssPath $issPath -ModoCompactacao $ModoCompactacao
    Set-MedProntoProgressBusy $Progress "Compilando $outName" "Compactando o instalador - a barra continua se movendo."
    Write-Host "      compilando $outName ..." -ForegroundColor Gray
    if (Get-Command Invoke-ProcessWithUiPulse -ErrorAction SilentlyContinue) {
        $code = Invoke-ProcessWithUiPulse -FilePath $Iscc -ArgumentList @('/Qp', $issPath) -Progress $Progress -BusyText "Compilando $outName"
    } else {
        $code = 1
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $isccOut = & $Iscc '/Qp' $issPath 2>&1
            $code = $LASTEXITCODE
            foreach ($line in @($isccOut)) {
                Write-Host "      $line" -ForegroundColor DarkGray
            }
        } finally {
            $ErrorActionPreference = $prevEap
        }
    }
    Remove-Item -LiteralPath $issPath -Force -ErrorAction SilentlyContinue
    if ($code -ne 0) {
        throw "Inno Setup falhou em $outName (codigo $code)"
    }
    $built = Join-Path $tmpOut $outName
    if (-not (Test-Path -LiteralPath $built)) {
        throw "$outName nao foi gerado em $tmpOut"
    }
    $exe = Join-Path $OutputDir $outName
    try {
        Copy-Item -LiteralPath $built -Destination $exe -Force
    } catch {
        throw "Nao deu para gravar $exe — feche o Explorador nesse arquivo (nao deixe ele selecionado) e empacote de novo. $($_.Exception.Message)"
    }
    return $exe
}

function Build-MedProntoClienteExes {
    param(
        [string]$Staging,
        [string]$OutputDir,
        [string]$CacheDir,
        [string]$Version,
        [ValidateSet('rapido', 'otimizado')]
        [string]$ModoCompactacao = 'rapido',
        $Progress = $null
    )
    if (Get-Command Set-MedProntoProgressBusy -ErrorAction SilentlyContinue) {
        Set-MedProntoProgressBusy $Progress 'Preparando o compilador Inno Setup...' 'Fica em cache; nao baixa de novo.'
    }
    $iscc = Ensure-InnoSetupCompiler -CacheDir $CacheDir
    $paths = @()
    foreach ($kind in @('completa', 'atualizacao')) {
        $paths += (Build-MedProntoClienteExe -Kind $kind -Staging $Staging -OutputDir $OutputDir -CacheDir $CacheDir -Version $Version -Iscc $iscc -ModoCompactacao $ModoCompactacao -Progress $Progress)
    }
    return $paths
}


