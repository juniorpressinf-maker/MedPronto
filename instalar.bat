@echo off
setlocal enabledelayedexpansion
title MedPronto - Instalacao
cd /d "%~dp0"

echo.
echo ========================================
echo  MedPronto - INSTALACAO (modo tecnico)
echo ========================================
echo  Pasta: %CD%
echo.
echo  Dica: para usuario final, use:
echo    Instalar MedPronto.bat  (permite escolher pasta)
echo.

set "USANDO_NODE_LOCAL=0"
if exist "%~dp0node\node.exe" (
    set "PATH=%~dp0node;%PATH%"
    set "USANDO_NODE_LOCAL=1"
    echo  Node.js portatil em .\node\
) else (
    where node >nul 2>&1
    if errorlevel 1 goto :baixar_node
    node -e "const m=+process.version.slice(1);process.exit(m>=20&&m<=22?0:1)" >nul 2>&1
    if errorlevel 1 (
        echo  Node do sistema nao e LTS 20-22. Baixando Node portatil...
        goto :baixar_node
    )
    echo  Node.js LTS do sistema:
)

:continuar_instalar
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo  Versao: %NODE_VER%
echo.

if not exist "data\" mkdir "data\"

if exist "node_modules\" (
    echo [1/5] node_modules ja presente.
    node -e "const D=require('better-sqlite3'); new D(':memory:')" >nul 2>&1
    if errorlevel 1 (
        echo       Recompilando better-sqlite3...
        call npm rebuild better-sqlite3
        if errorlevel 1 goto :erro_npm
    )
) else (
    echo [1/5] Instalando dependencias...
    call npm install
    if errorlevel 1 goto :erro_npm
)

echo.
echo [2/5] cloudflared ^(tunel remoto, opcional^)...
if exist "%~dp0scripts\cloudflared-lib.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "& { . '%~dp0scripts\cloudflared-lib.ps1'; $ok = Ensure-CloudflaredInDir -TargetDir '%CD%' -CacheDir '%CD%\.cache' -AllowDownload; if ($ok) { Write-Host '      bin\cloudflared.exe OK' } else { Write-Host '      AVISO: tunel indisponivel' } }"
) else (
    echo       Pulado ^(nao necessario para o consultorio^).
)

echo.
echo [3/5] Compilando para producao...
call npm run build
if errorlevel 1 goto :erro_build

echo.
echo [4/5] Banco de dados...
if not exist ".env" if exist ".env.example" copy ".env.example" ".env" >nul
call npm run db:migrate
if errorlevel 1 goto :erro_db

echo.
echo [5/5] Atalhos na area de trabalho...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0criar_atalho.ps1" -InstallDir "%CD%"
if errorlevel 1 (
    echo *** AVISO: nao foi possivel criar atalhos. Execute criar_atalho.bat manualmente. ***
)

echo.
echo ========================================
echo  INSTALACAO CONCLUIDA
echo ========================================
echo.
echo  Abrir:  atalho "MedPronto" na area de trabalho
echo  Parar:  atalho "MedPronto - parar"
echo.
if "%USANDO_NODE_LOCAL%"=="1" (
    echo  Modo: Node portatil em .\node\
) else (
    echo  Modo: Node.js do sistema ^(recomendado 20-22 LTS^)
)
echo.

set "RUN="
set /p "RUN=Iniciar agora? (S/N): "
if /i "!RUN!"=="S" (
    if exist "%CD%\iniciar.vbs" (
        start "" wscript.exe //B "%CD%\iniciar.vbs"
    ) else if exist "%CD%\iniciar.ps1" (
        start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%CD%\iniciar.ps1"
    ) else (
        start "" "%CD%\iniciar.bat"
    )
    exit /b 0
)
echo.
pause
exit /b 0

:baixar_node
echo.
echo Baixando Node.js 22 LTS portatil para .\node\ ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\baixar-node-portatil.ps1" -Root "%CD%"
if errorlevel 1 goto :no_node
set "PATH=%~dp0node;%PATH%"
set "USANDO_NODE_LOCAL=1"
echo  Node.js portatil em .\node\
goto :continuar_instalar

:no_node
echo.
echo *** Node.js nao encontrado ***
echo.
echo Instale Node.js 20-22 LTS em https://nodejs.org
echo ou execute instalar.bat com internet para baixar Node portatil.
echo.
timeout /t 3 /nobreak >nul
start "" https://nodejs.org/pt-br/download
pause
exit /b 1

:erro_npm
echo *** ERRO no npm install/rebuild ***
pause
exit /b 1

:erro_db
echo *** ERRO no banco de dados ***
pause
exit /b 1

:erro_build
echo *** ERRO na compilacao (npm run build) ***
pause
exit /b 1
