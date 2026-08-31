# MedPronto - biblioteca compartilhada dos instaladores (Instalar / Atualizar)
# empacotar-lib e so do fornecedor: no assistente Inno ela nao existe em {tmp}.
$empacotarLib = Join-Path $PSScriptRoot 'empacotar-lib.ps1'
if (Test-Path -LiteralPath $empacotarLib) {
    . $empacotarLib
}

function Get-SystemDriveRoot {
    $d = $env:SystemDrive
    if ([string]::IsNullOrWhiteSpace($d)) { return 'C:\' }
    if (-not $d.EndsWith('\')) { return "$d\" }
    return $d
}

function Test-DriveReachable {
    param([string]$DriveLetter)
    if ([string]::IsNullOrWhiteSpace($DriveLetter)) { return $false }
    $root = "$($DriveLetter.TrimEnd(':')):\"
    return Test-Path -LiteralPath $root
}

function Test-RootPathReachable {
    param([string]$Root)
    $r = Normalize-MedProntoRoot $Root
    if ([string]::IsNullOrWhiteSpace($r)) { return $false }
    if ($r -match '^([A-Za-z]):') {
        return (Test-DriveReachable $Matches[1])
    }
    return $true
}

function Get-MedProntoDefaultPath {
    param([string]$NearPath = '')
    $reg = Read-MedProntoInstallPath
    if ($reg) {
        if (Test-MedProntoLiveInstall $reg) { return $reg }
        if (Test-MedProntoInstall $reg) { return $reg }
    }
    $near = Normalize-MedProntoRoot $NearPath
    if ($near -match '^([A-Za-z]):\\') {
        $letter = $Matches[1]
        if (Test-DriveReachable $letter) {
            return "${letter}:\MedPronto"
        }
    }
    $sysRoot = Get-SystemDriveRoot
    return Join-Path $sysRoot.TrimEnd('\') 'MedPronto'
}

function Read-MedProntoInstallPath {
    $keys = @(
        'HKCU:\Software\MedPronto',
        'HKLM:\Software\MedPronto',
        'HKLM:\Software\WOW6432Node\MedPronto'
    )
    foreach ($p in $keys) {
        if (-not (Test-Path -LiteralPath $p)) { continue }
        $v = (Get-ItemProperty -LiteralPath $p -ErrorAction SilentlyContinue).InstallDir
        if (-not [string]::IsNullOrWhiteSpace($v) -and (Test-RootPathReachable $v)) {
            return (Normalize-MedProntoRoot $v)
        }
    }
    return ''
}

function Save-MedProntoInstallPath {
    param([string]$Root)
    $root = Normalize-MedProntoRoot $Root
    if ([string]::IsNullOrWhiteSpace($root)) { return }
    New-Item -Path 'HKCU:\Software\MedPronto' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\Software\MedPronto' -Name 'InstallDir' -Value $root
    try {
        New-Item -Path 'HKLM:\Software\MedPronto' -Force -ErrorAction Stop | Out-Null
        Set-ItemProperty -Path 'HKLM:\Software\MedPronto' -Name 'InstallDir' -Value $root -ErrorAction Stop
    } catch {
        # sem admin: so HKCU basta para achar a pasta na atualizacao
    }
}

function Get-FolderPickerStartPath {
    param([string]$PreferredPath = '')
    $p = Normalize-MedProntoRoot $PreferredPath
    if (-not [string]::IsNullOrWhiteSpace($p) -and (Test-RootPathReachable $p)) {
        if (Test-Path -LiteralPath $p) { return $p }
        $parent = Split-Path $p -Parent
        if (-not [string]::IsNullOrWhiteSpace($parent) -and (Test-Path -LiteralPath $parent)) {
            return $parent
        }
    }
    return (Get-SystemDriveRoot).TrimEnd('\')
}

function Normalize-MedProntoRoot {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return '' }
    return $Path.Trim().Trim('"').TrimEnd('\', '/')
}

function Test-MedProntoInstall {
    param([string]$InstallDir)
    $root = Normalize-MedProntoRoot $InstallDir
    if ([string]::IsNullOrWhiteSpace($root)) { return $false }
    if (-not (Test-RootPathReachable $root)) { return $false }
    return Test-Path -LiteralPath (Join-Path $root 'iniciar.vbs')
}

function Test-MedProntoLiveInstall {
    param([string]$InstallDir)
    if (-not (Test-MedProntoInstall $InstallDir)) { return $false }
    $db = Join-Path (Normalize-MedProntoRoot $InstallDir) 'data\medpronto.db'
    return Test-Path -LiteralPath $db
}

function Test-MedProntoPayload {
    param([string]$PayloadDir)
    $root = Normalize-MedProntoRoot $PayloadDir
    if ([string]::IsNullOrWhiteSpace($root)) { return $false }
    if (-not (Test-RootPathReachable $root)) { return $false }
    $hasLauncher = (Test-Path -LiteralPath (Join-Path $root 'iniciar.vbs')) -or `
        (Test-Path -LiteralPath (Join-Path $root 'instalar.bat')) -or `
        (Test-Path -LiteralPath (Join-Path $root 'Instalar MedPronto.bat'))
    $hasBackend = Test-Path -LiteralPath (Join-Path $root 'backend\package.json')
    return ($hasLauncher -and $hasBackend)
}

function Show-MedProntoMessage {
    param(
        [string]$Message,
        [string]$Title = 'MedPronto',
        [ValidateSet('info', 'warning', 'error', 'question')]
        [string]$Type = 'info'
    )
    Add-Type -AssemblyName System.Windows.Forms
    $icon = [System.Windows.Forms.MessageBoxIcon]::Information
    if ($Type -eq 'warning') { $icon = [System.Windows.Forms.MessageBoxIcon]::Warning }
    if ($Type -eq 'error') { $icon = [System.Windows.Forms.MessageBoxIcon]::Error }
    if ($Type -eq 'question') { $icon = [System.Windows.Forms.MessageBoxIcon]::Question }
    [System.Windows.Forms.MessageBox]::Show($Message, $Title, [System.Windows.Forms.MessageBoxButtons]::OK, $icon) | Out-Null
}

function Show-MedProntoYesNo {
    param(
        [string]$Message,
        [string]$Title = 'MedPronto',
        [switch]$Warning
    )
    Add-Type -AssemblyName System.Windows.Forms
    $icon = [System.Windows.Forms.MessageBoxIcon]::Question
    if ($Warning) { $icon = [System.Windows.Forms.MessageBoxIcon]::Warning }
    $r = [System.Windows.Forms.MessageBox]::Show(
        $Message,
        $Title,
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        $icon
    )
    return ($r -eq [System.Windows.Forms.DialogResult]::Yes)
}

function Test-InstallDirHasContent {
    param([string]$InstallDir)
    $root = Normalize-MedProntoRoot $InstallDir
    if ([string]::IsNullOrWhiteSpace($root)) { return $false }
    if (-not (Test-Path -LiteralPath $root)) { return $false }
    $child = Get-ChildItem -LiteralPath $root -Force -ErrorAction SilentlyContinue | Select-Object -First 1
    return [bool]$child
}

function Show-FreshInstallDangerConfirm {
    param([string]$InstallDir)
    $path = Normalize-MedProntoRoot $InstallDir

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'PERIGO - apagar instalacao existente'
    $form.Size = New-Object System.Drawing.Size(560, 430)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true

    $titulo = New-Object System.Windows.Forms.Label
    $titulo.Text = 'SEGUNDA CONFIRMACAO - ISSO APAGA TUDO'
    $titulo.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
    $titulo.ForeColor = [System.Drawing.Color]::Firebrick
    $titulo.AutoSize = $false
    $titulo.Size = New-Object System.Drawing.Size(520, 28)
    $titulo.Location = New-Object System.Drawing.Point(16, 12)
    $form.Controls.Add($titulo)

    $corpo = New-Object System.Windows.Forms.Label
    $corpo.Text = "Voce escolheu instalar o MedPronto em uma pasta que JA TEM arquivos.`n`nPasta:`n$path`n`nSe continuar, esta instalacao NOVA vai APAGAR de forma permanente:`n  - pacientes e prontuarios`n  - consultas, exames e PDFs`n  - agenda`n  - cobranca e configuracoes`n`nIsso NAO tem volta. Nao existe desfazer.`n`nSe a clinica ja usa o MedPronto nesta pasta e voce quer MANTER os dados, cancele agora e use Atualizar MedPronto.bat."
    $corpo.AutoSize = $false
    $corpo.Size = New-Object System.Drawing.Size(520, 230)
    $corpo.Location = New-Object System.Drawing.Point(16, 44)
    $form.Controls.Add($corpo)

    $chk = New-Object System.Windows.Forms.CheckBox
    $chk.Text = 'Entendi: quero APAGAR todos os arquivos e dados desta pasta.'
    $chk.AutoSize = $false
    $chk.Size = New-Object System.Drawing.Size(520, 36)
    $chk.Location = New-Object System.Drawing.Point(16, 280)
    $form.Controls.Add($chk)

    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = 'Apagar tudo e instalar do zero'
    $ok.Enabled = $false
    $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $ok.Size = New-Object System.Drawing.Size(250, 32)
    $ok.Location = New-Object System.Drawing.Point(130, 340)
    $form.Controls.Add($ok)

    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = 'Cancelar'
    $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $cancel.Size = New-Object System.Drawing.Size(140, 32)
    $cancel.Location = New-Object System.Drawing.Point(390, 340)
    $form.CancelButton = $cancel
    $form.Controls.Add($cancel)

    $chk.Add_CheckedChanged({ $ok.Enabled = $chk.Checked }.GetNewClosure())

    $form.Add_Shown({ $form.Activate() })
    return ($form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK -and $chk.Checked)
}

function Confirm-FreshInstallOverwrite {
    param([string]$InstallDir)
    $path = Normalize-MedProntoRoot $InstallDir
    $ehMedPronto = Test-MedProntoInstall $path
    $temBanco = Test-Path -LiteralPath (Join-Path $path 'data\medpronto.db')
    $detalhe = if ($ehMedPronto -or $temBanco) {
        "Ha uma instalacao/dados do MedPronto nesta pasta."
    } else {
        "A pasta ja existe e contem arquivos."
    }
    $primeiro = Show-MedProntoYesNo -Warning `
        -Title 'Instalar MedPronto - atencao' `
        -Message ("$detalhe`n`nPasta:`n$path`n`n" +
            "Instalar como NOVA instalacao vai APAGAR os dados deste destino:`n" +
            "pacientes, consultas, exames, agenda e configuracoes.`n`n" +
            "Isso NAO pode ser desfeito.`n`n" +
            "Para manter os dados, cancele e use Atualizar MedPronto.bat.`n`n" +
            "Deseja apagar os dados e instalar do zero?")
    if (-not $primeiro) { return $false }
    return (Show-FreshInstallDangerConfirm -InstallDir $path)
}

function Clear-MedProntoInstallData {
    param([string]$InstallDir)
    $root = Normalize-MedProntoRoot $InstallDir
    if ([string]::IsNullOrWhiteSpace($root)) { return }
    if (-not (Test-Path -LiteralPath $root)) { return }

    Stop-MedPronto -InstallDir $root
    Wait-MedProntoStopped -InstallDir $root -Seconds 20

    $dataDir = Join-Path $root 'data'
    $tries = 0
    while ($tries -lt 5) {
        $tries++
        try {
            if (Test-Path -LiteralPath $dataDir) {
                Remove-Item -LiteralPath $dataDir -Recurse -Force -ErrorAction Stop
            }
            break
        } catch {
            if ($tries -ge 5) { throw }
            Stop-MedPronto -InstallDir $root
            Start-Sleep -Seconds 1
        }
    }
    $envFile = Join-Path $root '.env'
    if (Test-Path -LiteralPath $envFile) {
        Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue
    }
}

function Apply-MedProntoEdicaoUnica {
    param(
        [string]$Root,
        $Tools
    )
    $root = Normalize-MedProntoRoot $Root
    $defScript = Join-Path $root 'scripts\definir-edicao.mjs'
    if (-not (Test-Path -LiteralPath $defScript)) {
        return 'definir-edicao.mjs ausente - migration U1 ja forca produto unico'
    }
    if (-not $Tools) { throw 'Node.js nao encontrado para gravar a edicao unica.' }
    $out = & $Tools.Node $defScript 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao gravar produto unico no banco"
    }
    return $out
}

function Resolve-FreshInstallPath {
    param([string]$Candidate)

    $candidate = Normalize-MedProntoRoot $Candidate
    if ([string]::IsNullOrWhiteSpace($candidate)) { return '' }

    if (Test-InstallDirHasContent $candidate) {
        if (-not (Confirm-FreshInstallOverwrite $candidate)) { return '' }
        return $candidate
    }

    if (Test-Path -LiteralPath $candidate) {
        $use = Show-MedProntoYesNo `
            -Title 'Instalar MedPronto' `
            -Message "Instalar o MedPronto em:`n`n$candidate`n`nUsar esta pasta?"
        if ($use) { return $candidate }
        return ''
    }

    if (-not (Test-RootPathReachable $candidate)) {
        $candidate = Get-MedProntoDefaultPath
    }
    $create = Show-MedProntoYesNo `
        -Title 'Instalar MedPronto' `
        -Message "A pasta ainda nao existe:`n$candidate`n`nCriar e instalar nesta pasta?"
    if ($create) {
        New-Item -ItemType Directory -Force -Path $candidate | Out-Null
        return $candidate
    }
    return ''
}

function Show-InstallFolderPicker {
    param(
        [string]$DefaultPath = (Get-MedProntoDefaultPath)
    )

    Add-Type -AssemblyName System.Windows.Forms
    $path = Normalize-MedProntoRoot $DefaultPath

    $chosen = Resolve-FreshInstallPath $path
    if (-not [string]::IsNullOrWhiteSpace($chosen)) { return $chosen }

    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = 'Escolha onde instalar o MedPronto (ex.: C:\MedPronto)'
    $dlg.SelectedPath = Get-FolderPickerStartPath $path
    $dlg.ShowNewFolderButton = $true
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        return ''
    }
    return Resolve-FreshInstallPath (Normalize-MedProntoRoot $dlg.SelectedPath)
}

function Show-UpdateFolderPicker {
    param([string]$DefaultPath = (Get-MedProntoDefaultPath))

    Add-Type -AssemblyName System.Windows.Forms
    $path = Normalize-MedProntoRoot $DefaultPath

    while ($true) {
        if (Test-MedProntoLiveInstall $path) {
            $use = Show-MedProntoYesNo `
                -Title 'Atualizar MedPronto' `
                -Message "Encontramos o MedPronto instalado em:`n`n$path`n`nAtualizar esta pasta?"
            if ($use) { return $path }
        } elseif (Test-MedProntoInstall $path) {
            Show-MedProntoMessage `
                -Type 'warning' `
                -Title 'Atualizar MedPronto' `
                -Message "Esta pasta e o PACOTE de atualizacao, nao a instalacao da clinica.`n`n$path`n`nEscolha a pasta onde o MedPronto ja roda (ex.: C:\MedPronto)."
        } elseif ((Test-RootPathReachable $path) -and (Test-Path -LiteralPath $path)) {
            Show-MedProntoMessage `
                -Type 'warning' `
                -Title 'Atualizar MedPronto' `
                -Message "A pasta existe, mas nao parece ter o MedPronto (falta iniciar.vbs):`n$path`n`nEscolha a pasta onde o MedPronto ja esta instalado."
        } else {
            $pick = Show-MedProntoYesNo `
                -Title 'Atualizar MedPronto' `
                -Message "Nao encontramos o MedPronto em:`n$path`n`nDeseja escolher outra pasta?"
            if (-not $pick) { return '' }
        }

        $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
        $dlg.Description = 'Onde o MedPronto esta instalado? (pasta com iniciar.vbs)'
        $dlg.SelectedPath = Get-FolderPickerStartPath $path
        $dlg.ShowNewFolderButton = $false
        if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
            return ''
        }
        $path = Normalize-MedProntoRoot $dlg.SelectedPath
        if (-not (Test-MedProntoLiveInstall $path)) {
            $msg = if (Test-MedProntoInstall $path) {
                "Esta pasta e o pacote extraido, nao a instalacao da clinica:`n$path`n`nEscolha a pasta do atalho (ex.: C:\MedPronto), onde ja existem os pacientes."
            } else {
                "Esta pasta nao tem o MedPronto instalado:`n$path`n`nEscolha a pasta do atalho (ex.: C:\MedPronto)."
            }
            Show-MedProntoMessage -Type 'warning' -Title 'Atualizar MedPronto' -Message $msg
            continue
        }
        return $path
    }
}

function New-MedProntoProgress {
    param(
        [string]$Title = 'MedPronto',
        [int]$TotalSteps = 6
    )

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    try { [System.Windows.Forms.Application]::EnableVisualStyles() } catch { }

    $form = New-Object System.Windows.Forms.Form
    $form.Text = $Title
    $form.Size = New-Object System.Drawing.Size(560, 268)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true
    $form.ControlBox = $false
    $form.BackColor = [System.Drawing.Color]::White

    $header = New-Object System.Windows.Forms.Panel
    $header.Location = New-Object System.Drawing.Point(0, 0)
    $header.Size = New-Object System.Drawing.Size(560, 52)
    $header.BackColor = [System.Drawing.Color]::FromArgb(15, 118, 110)
    $form.Controls.Add($header)

    $lblBrand = New-Object System.Windows.Forms.Label
    $lblBrand.Location = New-Object System.Drawing.Point(20, 14)
    $lblBrand.Size = New-Object System.Drawing.Size(520, 26)
    $lblBrand.ForeColor = [System.Drawing.Color]::White
    $lblBrand.Font = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
    $lblBrand.Text = $Title
    $header.Controls.Add($lblBrand)

    $lblStep = New-Object System.Windows.Forms.Label
    $lblStep.Location = New-Object System.Drawing.Point(20, 66)
    $lblStep.Size = New-Object System.Drawing.Size(510, 40)
    $lblStep.Font = New-Object System.Drawing.Font('Segoe UI', 10.5, [System.Drawing.FontStyle]::Regular)
    $lblStep.Text = 'Preparando...'
    $form.Controls.Add($lblStep)

    $lblDetail = New-Object System.Windows.Forms.Label
    $lblDetail.Location = New-Object System.Drawing.Point(20, 110)
    $lblDetail.Size = New-Object System.Drawing.Size(510, 36)
    $lblDetail.ForeColor = [System.Drawing.Color]::FromArgb(90, 90, 90)
    $lblDetail.Font = New-Object System.Drawing.Font('Segoe UI', 9)
    $lblDetail.Text = 'Aguarde — nao feche esta janela.'
    $form.Controls.Add($lblDetail)

    $bar = New-Object System.Windows.Forms.ProgressBar
    $bar.Location = New-Object System.Drawing.Point(20, 156)
    $bar.Size = New-Object System.Drawing.Size(510, 22)
    $bar.Minimum = 0
    $bar.Maximum = $TotalSteps
    $bar.Value = 0
    $bar.Style = 'Continuous'
    $form.Controls.Add($bar)

    $lblPct = New-Object System.Windows.Forms.Label
    $lblPct.Location = New-Object System.Drawing.Point(20, 186)
    $lblPct.Size = New-Object System.Drawing.Size(510, 22)
    $lblPct.ForeColor = [System.Drawing.Color]::FromArgb(110, 110, 110)
    $lblPct.Font = New-Object System.Drawing.Font('Segoe UI', 8.5)
    $lblPct.Text = 'Passo 0 de ' + $TotalSteps
    $form.Controls.Add($lblPct)

    $form.Add_Shown({ $form.Activate() })
    $form.Show()
    [System.Windows.Forms.Application]::DoEvents()

    return @{
        Form       = $form
        StepLabel  = $lblStep
        DetailLabel = $lblDetail
        Bar        = $bar
        PctLabel   = $lblPct
        Total      = $TotalSteps
    }
}

function Update-MedProntoProgress {
    param(
        $Progress,
        [int]$Step,
        [string]$Title,
        [string]$Detail = ''
    )
    if (-not $Progress) { return }
    $total = [int]$Progress.Total
    if ($Step -lt 0) { $Step = 0 }
    if ($Step -gt $total) { $Step = $total }
    try {
        $Progress.Bar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
        $Progress.Bar.MarqueeAnimationSpeed = 0
    } catch { }
    $Progress.StepLabel.Text = "[$Step/$total] $Title"
    if ($Detail) { $Progress.DetailLabel.Text = $Detail }
    $Progress.Bar.Value = $Step
    $pct = if ($total -gt 0) { [int][math]::Round(100 * $Step / $total) } else { 0 }
    $Progress.PctLabel.Text = "Passo $Step de $total ($pct%)"
    [System.Windows.Forms.Application]::DoEvents()
}

function Set-MedProntoProgressBusy {
    param(
        $Progress,
        [string]$Title,
        [string]$Detail = 'Aguarde — nao feche esta janela.'
    )
    if (-not $Progress) { return }
    $Progress.StepLabel.Text = $Title
    if ($Detail) { $Progress.DetailLabel.Text = $Detail }
    $Progress.PctLabel.Text = 'Em andamento...'
    try {
        $Progress.Bar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
        $Progress.Bar.MarqueeAnimationSpeed = 30
    } catch { }
    [System.Windows.Forms.Application]::DoEvents()
}

function Set-MedProntoProgressDetail {
    param($Progress, [string]$Detail)
    if (-not $Progress) { return }
    $text = $Detail
    if ($text.Length -gt 90) { $text = '...' + $text.Substring($text.Length - 87) }
    $Progress.DetailLabel.Text = $text
    [System.Windows.Forms.Application]::DoEvents()
}

function Close-MedProntoProgress {
    param($Progress)
    if ($Progress -and $Progress.Form) {
        $Progress.Form.Close()
        $Progress.Form.Dispose()
    }
}

function Invoke-ProcessWithUiPulse {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$ArgumentList = @(),
        $Progress = $null,
        [string]$BusyText = 'Aguarde...'
    )
    $quoted = foreach ($a in @($ArgumentList)) {
        $s = [string]$a
        if ($s -match '[\s"]') { '"' + ($s -replace '"', '\"') + '"' } else { $s }
    }
    $argLine = [string]::Join(' ', $quoted)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.Arguments = $argLine
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $p = New-Object System.Diagnostics.Process
    $p.StartInfo = $psi
    [void]$p.Start()
    $t0 = Get-Date
    try {
        while (-not $p.HasExited) {
            Start-Sleep -Milliseconds 280
            try { [System.Windows.Forms.Application]::DoEvents() } catch { }
            $sec = [int]((Get-Date) - $t0).TotalSeconds
            Set-MedProntoProgressDetail $Progress ("$BusyText  ${sec}s")
        }
        $p.WaitForExit()
        return $p.ExitCode
    } finally {
        try { $p.Dispose() } catch { }
    }
}

function Get-MedProntoNodeTools {
    param([string]$Root)

    $portable = Join-Path $Root 'node\node.exe'
    if (Test-Path -LiteralPath $portable) {
        return @{
            Node    = $portable
            Npm     = Join-Path $Root 'node\npm.cmd'
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

function Get-MedProntoPidsUnderRoot {
    param([string]$InstallDir)
    $root = Normalize-MedProntoRoot $InstallDir
    if ([string]::IsNullOrWhiteSpace($root)) { return @() }
    $prefix = $root + '\'
    $ids = @()
    try {
        foreach ($p in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
            $id = 0
            try { $id = [int]$p.ProcessId } catch { continue }
            if ($id -le 4) { continue }
            $exe = [string]$p.ExecutablePath
            $cmd = [string]$p.CommandLine
            $name = [string]$p.Name
            $under = $false
            if ($exe -and ($exe.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or $exe.Equals($root, [StringComparison]::OrdinalIgnoreCase))) {
                $under = $true
            } elseif ($cmd -and ($cmd.IndexOf($prefix, [StringComparison]::OrdinalIgnoreCase) -ge 0) -and ($name -match '^(node|cloudflared|wscript|cscript)\.exe$')) {
                $under = $true
            } elseif ($cmd -and ($cmd.IndexOf('edge-medpronto', [StringComparison]::OrdinalIgnoreCase) -ge 0) -and ($name -match '^(msedge|chrome)\.exe$')) {
                $under = $true
            }
            if ($under) { $ids += $id }
        }
    } catch { }
    return @($ids | Select-Object -Unique)
}

function Test-MedProntoFileLocked {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    try {
        $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $fs.Dispose()
        return $false
    } catch {
        return $true
    }
}

function Stop-MedProntoPids {
    param([int[]]$ProcessIds)
    foreach ($id in @($ProcessIds)) {
        if ($id -le 4) { continue }
        if ($id -eq $PID) { continue }
        try { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } catch { }
        try { & taskkill.exe /F /T /PID $id 2>$null | Out-Null } catch { }
    }
}

function Stop-MedPronto {
    param([string]$InstallDir)
    $root = Normalize-MedProntoRoot $InstallDir
    if ([string]::IsNullOrWhiteSpace($root)) { return }

    $script = Join-Path $PSScriptRoot 'parar-medpronto.ps1'
    if (-not (Test-Path -LiteralPath $script)) {
        $script = Join-Path $root 'scripts\parar-medpronto.ps1'
    }
    if (Test-Path -LiteralPath $script) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -InstallDir $root
    } else {
        $parar = Join-Path $root 'parar.bat'
        if (Test-Path -LiteralPath $parar) {
            $env:MEDPRONTO_QUIET = '1'
            & cmd.exe /c "`"$parar`"" *> $null
            Remove-Item Env:MEDPRONTO_QUIET -ErrorAction SilentlyContinue
        }
    }
    Stop-MedProntoPids (Get-MedProntoPidsUnderRoot $root)
}

function Get-MedProntoLockPaths {
    param([string]$InstallDir)
    $root = Normalize-MedProntoRoot $InstallDir
    return @(
        (Join-Path $root 'node\node.exe'),
        (Join-Path $root 'bin\cloudflared.exe'),
        (Join-Path $root 'node_modules\better-sqlite3\build\Release\better_sqlite3.node'),
        (Join-Path $root 'data\medpronto.db')
    )
}

function Test-MedProntoRootLocked {
    param([string]$InstallDir)
    foreach ($p in @(Get-MedProntoLockPaths $InstallDir)) {
        if (Test-MedProntoFileLocked $p) { return $true }
    }
    return $false
}

function Unlock-MedProntoExecutables {
    param([string]$InstallDir)
    $root = Normalize-MedProntoRoot $InstallDir
    if ([string]::IsNullOrWhiteSpace($root) -or -not (Test-Path -LiteralPath $root)) { return }

    Stop-MedProntoPids (Get-MedProntoPidsUnderRoot $root)
    foreach ($name in @('node.exe', 'cloudflared.exe')) {
        try { & taskkill.exe /F /IM $name /T 2>$null | Out-Null } catch { }
    }
    Start-Sleep -Seconds 2
    Stop-MedProntoPids (Get-MedProntoPidsUnderRoot $root)

    # Windows deixa o instalador APAGAR arquivo em uso (codigo 5), mas ACEITA
    # renomear a pasta inteira. O assistente grava node e node_modules novos.
    $stamp = Get-Date -Format 'yyyyMMddHHmmssfff'
    foreach ($name in @('node', 'node_modules', 'bin')) {
        $src = Join-Path $root $name
        if (-not (Test-Path -LiteralPath $src)) { continue }
        $dest = Join-Path $root "$name.bak-inno-$stamp"
        try {
            [System.IO.Directory]::Move($src, $dest)
        } catch {
            try {
                Move-Item -LiteralPath $src -Destination $dest -Force -ErrorAction Stop
            } catch {
                $null = & cmd.exe /c "cd /d `"$($root.Substring(0,2))\`" & move /Y `"$src`" `"$dest`""
            }
        }
    }

    $nm = Join-Path $root 'node_modules'
    if (Test-Path -LiteralPath $nm) {
        Get-ChildItem -LiteralPath $nm -Filter '*.node' -Recurse -Force -ErrorAction SilentlyContinue |
            ForEach-Object {
                $bak = $_.FullName + '.bak-inno'
                try { [System.IO.File]::Move($_.FullName, $bak) } catch { }
            }
    }
}

function Remove-MedProntoInnoBakTrees {
    param([string]$InstallDir)
    $root = Normalize-MedProntoRoot $InstallDir
    if ([string]::IsNullOrWhiteSpace($root) -or -not (Test-Path -LiteralPath $root)) { return }
    Get-ChildItem -LiteralPath $root -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -like 'node.bak-inno*' -or
            $_.Name -like 'node_modules.bak-inno*' -or
            $_.Name -like 'bin.bak-inno*'
        } |
        ForEach-Object {
            try {
                if ($_.PSIsContainer) {
                    cmd.exe /c "attrib -R -S -H `"$($_.FullName)\*.*`" /S /D" 2>$null | Out-Null
                }
                Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
            } catch { }
        }
}

function Wait-MedProntoStopped {
    param(
        [string]$InstallDir,
        [int]$Seconds = 20,
        [switch]$IgnoreDataLock
    )
    $root = Normalize-MedProntoRoot $InstallDir
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        $pids = @(Get-MedProntoPidsUnderRoot $root)
        if ($pids.Count -gt 0) {
            Stop-MedProntoPids $pids
        }
        $busy = ($pids.Count -gt 0)
        if (-not $IgnoreDataLock) {
            $busy = $busy -or (Test-MedProntoRootLocked $root)
        } else {
            foreach ($rel in @(
                    'node\node.exe',
                    'bin\cloudflared.exe',
                    'node_modules\better-sqlite3\build\Release\better_sqlite3.node'
                )) {
                if (Test-MedProntoFileLocked (Join-Path $root $rel)) { $busy = $true; break }
            }
        }
        if (-not $busy) { return }
        Start-Sleep -Milliseconds 400
        try { [System.Windows.Forms.Application]::DoEvents() } catch { }
    } while ((Get-Date) -lt $deadline)

    Unlock-MedProntoExecutables -InstallDir $root
}

function Backup-MedProntoInstall {
    param(
        [string]$InstallDir,
        [scriptblock]$Log,
        [string]$Label = 'atualizacao'
    )
    $root = Normalize-MedProntoRoot $InstallDir
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $safe = ($Label -replace '[^\w\-]', '')
    if ([string]::IsNullOrWhiteSpace($safe)) { $safe = 'backup' }
    $backupRoot = Join-Path $root "backups\$safe-$stamp"
    New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

    $dataDir = Join-Path $root 'data'
    $destData = Join-Path $backupRoot 'data'
    New-Item -ItemType Directory -Force -Path $destData | Out-Null

    if (Test-Path -LiteralPath $dataDir) {
        foreach ($name in @('medpronto.db', 'medpronto.db-wal', 'medpronto.db-shm')) {
            $src = Join-Path $dataDir $name
            if (Test-Path -LiteralPath $src) {
                Copy-Item -LiteralPath $src -Destination (Join-Path $destData $name) -Force
            }
        }

        foreach ($rel in @('uploads', 'auth')) {
            $src = Join-Path $dataDir $rel
            if (-not (Test-Path -LiteralPath $src)) { continue }
            $dest = Join-Path $destData $rel
            & robocopy $src $dest /E /NFL /NDL /NJH /NJS /NP /XJ /R:2 /W:1 | Out-Null
            if ($LASTEXITCODE -ge 8) {
                throw "Falha no backup de data\$rel (robocopy $LASTEXITCODE). Feche o MedPronto e tente de novo."
            }
        }
    }

    foreach ($name in @('.env', 'edicao.txt')) {
        $src = Join-Path $root $name
        if (Test-Path -LiteralPath $src) {
            Copy-Item -LiteralPath $src -Destination (Join-Path $backupRoot $name) -Force
        }
    }

    if ($Log) { & $Log "backup=$backupRoot" }
    return $backupRoot
}

function Copy-MedProntoPayload {
    param(
        [string]$PayloadDir,
        [string]$InstallDir,
        [switch]$PreserveData
    )

    $ex = Get-ClientPayloadExcludeLists -Root $PayloadDir
    $excludeDirs = [System.Collections.ArrayList]@($ex.Dirs)
    $excludeFiles = [System.Collections.ArrayList]@($ex.Files)

    if ($PreserveData) {
        # atualizacao: nunca sobrescreve banco nem .env (.env ja esta em excludeFiles)
    }

    $robocopyArgs = @(
        $PayloadDir, $InstallDir,
        '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XJ', '/R:3', '/W:2',
        '/XD'
    ) + [string[]]$excludeDirs
    $robocopyArgs += @('/XF') + [string[]]$excludeFiles

    $attempt = 0
    while ($true) {
        $attempt++
        & robocopy @robocopyArgs | Out-Null
        $rc = $LASTEXITCODE
        if ($rc -lt 8) { break }
        if ($attempt -ge 3) {
            throw "Falha ao copiar arquivos (robocopy $rc). O MedPronto ainda estava em uso. Feche pelo atalho Parar e tente de novo."
        }
        Stop-MedPronto -InstallDir $InstallDir
        Start-Sleep -Seconds 2
    }
}

function Invoke-MedProntoNpm {
    param(
        [hashtable]$Tools,
        [string]$WorkDir,
        [string[]]$Arguments,
        [scriptblock]$OnLine
    )

    Push-Location $WorkDir
    try {
        $oldPath = $env:PATH
        $env:PATH = "$($Tools.NodeDir);$env:PATH"
        $argStr = ($Arguments | ForEach-Object {
            if ($_ -match '\s') { "`"$_`"" } else { $_ }
        }) -join ' '
        $line = "`"$($Tools.Npm)`" $argStr 2>&1"
        $output = & cmd.exe /c $line
        $exit = $LASTEXITCODE
        foreach ($l in @($output)) {
            if ($OnLine) { & $OnLine ([string]$l) }
            else { $l }
        }
        if ($exit -ne 0) {
            throw "Comando npm falhou (codigo $exit): $argStr"
        }
    } finally {
        $env:PATH = $oldPath
        Pop-Location
    }
}

function Get-MedProntoPathLatestWriteTime {
    param(
        [string]$InstallDir,
        [string[]]$RelativePaths,
        [string[]]$ExcludeDirNames = @('node_modules', 'dist', '.git')
    )

    $latest = [DateTime]::MinValue
    foreach ($rel in $RelativePaths) {
        $full = Join-Path $InstallDir $rel
        if (-not (Test-Path -LiteralPath $full)) { continue }

        if (Test-Path -LiteralPath $full -PathType Leaf) {
            $t = (Get-Item -LiteralPath $full).LastWriteTimeUtc
            if ($t -gt $latest) { $latest = $t }
            continue
        }

        Get-ChildItem -LiteralPath $full -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            $skip = $false
            foreach ($part in $ExcludeDirNames) {
                $needle = [IO.Path]::DirectorySeparatorChar + $part + [IO.Path]::DirectorySeparatorChar
                if ($_.FullName.Contains($needle)) {
                    $skip = $true
                    break
                }
            }
            if (-not $skip -and $_.LastWriteTimeUtc -gt $latest) {
                $latest = $_.LastWriteTimeUtc
            }
        }
    }
    return $latest
}

function Test-MedProntoNeedsBuild {
    param([string]$InstallDir)

    $distWeb = Join-Path $InstallDir 'frontend\dist\index.html'
    $distApi = Join-Path $InstallDir 'backend\dist\index.js'

    $needWeb = -not (Test-Path -LiteralPath $distWeb)
    $needApi = -not (Test-Path -LiteralPath $distApi)

    if (-not $needWeb) {
        $srcWeb = Get-MedProntoPathLatestWriteTime -InstallDir $InstallDir -RelativePaths @(
            'frontend\src',
            'frontend\index.html',
            'frontend\package.json',
            'frontend\vite.config.ts',
            'frontend\tsconfig.json',
            'frontend\tsconfig.app.json'
        )
        $distWebTime = (Get-Item -LiteralPath $distWeb).LastWriteTimeUtc
        if ($srcWeb -gt $distWebTime) { $needWeb = $true }
    }

    if (-not $needApi) {
        $srcApi = Get-MedProntoPathLatestWriteTime -InstallDir $InstallDir -RelativePaths @(
            'backend\src',
            'backend\package.json',
            'backend\tsconfig.json'
        )
        $distApiTime = (Get-Item -LiteralPath $distApi).LastWriteTimeUtc
        if ($srcApi -gt $distApiTime) { $needApi = $true }
    }

    return @{
        Web = $needWeb
        Api = $needApi
    }
}

function Ensure-MedProntoBuild {
    param(
        [string]$InstallDir,
        [hashtable]$Tools,
        [scriptblock]$Log
    )

    $needs = Test-MedProntoNeedsBuild -InstallDir $InstallDir
    if (-not $needs.Web -and -not $needs.Api) {
        if ($Log) { & $Log 'build de producao OK' }
        return $needs
    }

    if ($needs.Web -and -not $needs.Api) {
        if ($Log) { & $Log 'atualizando interface (frontend)...' }
        Invoke-MedProntoNpm -Tools $Tools -WorkDir $InstallDir -Arguments @('run', 'build', '-w', 'frontend') -OnLine $Log
    } elseif ($needs.Api -and -not $needs.Web) {
        if ($Log) { & $Log 'atualizando servidor (backend)...' }
        Invoke-MedProntoNpm -Tools $Tools -WorkDir $InstallDir -Arguments @('run', 'build', '-w', 'backend') -OnLine $Log
    } else {
        if ($Log) { & $Log 'compilando para producao...' }
        Invoke-MedProntoNpm -Tools $Tools -WorkDir $InstallDir -Arguments @('run', 'build') -OnLine $Log
    }

    return $needs
}

function Register-MedProntoShortcuts {
    param([string]$InstallDir)
    $script = Join-Path $InstallDir 'criar_atalho.ps1'
    if (-not (Test-Path -LiteralPath $script)) { return }
    $p = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', $script, '-InstallDir', $InstallDir
    ) -Wait -PassThru -WindowStyle Hidden
    if ($p.ExitCode -ne 0) {
        Write-Host "aviso: atalhos nao atualizados (codigo $($p.ExitCode))"
    }
}
