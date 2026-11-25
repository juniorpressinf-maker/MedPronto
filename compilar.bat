@echo off
chcp 65001 >nul
title Compilar MedPronto
echo ========================================
echo   COMPILAR MEDPRONTO (servidor + tela)
echo ========================================
echo.

rem Usa o Node portatil da propria pasta do projeto.
set "PATH=%~dp0node;%PATH%"
cd /d "%~dp0"
REM Janela sem "Edicao Rapida": clique do mouse nao pausa mais o processo.
REM Reabre numa janela com titulo proprio; o registro (so desse titulo) tem QuickEdit=0.
if not "%MP_SEM_EDICAO%"=="1" (
    reg add "HKCU\Console\Compilar MedPronto" /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1
    set "MP_SEM_EDICAO=1"
    start "Compilar MedPronto" "%ComSpec%" /c ""%~f0""
    exit /b 0
)

echo [1/2] Compilando o SERVIDOR (backend)...
call npm run build -w backend
if errorlevel 1 goto erro
echo Servidor compilado.
echo.

echo [2/2] Compilando a TELA (frontend)...
call npm run build -w frontend
if errorlevel 1 goto erro
echo Tela compilada.
echo.

echo ========================================
echo   PRONTO! Compilado com sucesso.
echo ========================================
echo.
echo  - Mudou so a tela: de Ctrl+F5 no navegador.
echo  - Mudou o servidor: feche o MedPronto (atalho de parar) e abra de novo.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\console-ajustes.ps1" -Acao LimparTeclas >nul 2>&1
pause
exit /b 0

:erro
echo.
echo ========================================
echo   ERRO NA COMPILACAO - veja a mensagem acima.
echo   Nada foi alterado no MedPronto em uso.
echo ========================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\console-ajustes.ps1" -Acao LimparTeclas >nul 2>&1
pause
exit /b 1
