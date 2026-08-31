@echo off
REM Diagnostico manual — janela visivel com mensagens de erro.
cd /d "%~dp0"
echo === MedPronto: iniciando (modo diagnostico) ===
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\medpronto_launcher.ps1"
set RC=%ERRORLEVEL%
if %RC% neq 0 (
    echo.
    echo === Falhou com codigo %RC% ===
    echo Veja ULTIMO-ERRO.txt e data\medpronto.log
    pause
)
exit /b %RC%
