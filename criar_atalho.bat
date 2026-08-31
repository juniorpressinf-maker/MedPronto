@echo off
title MedPronto - Criar atalhos
cd /d "%~dp0"

echo.
echo Criando atalhos na area de trabalho...
echo Pasta: %CD%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0criar_atalho.ps1" -InstallDir "%CD%"
if errorlevel 1 (
    echo.
    echo *** Falha ao criar atalhos. Veja a mensagem acima. ***
    pause
    exit /b 1
)

echo.
echo Pronto. Use o atalho "MedPronto" na area de trabalho.
echo.
pause
exit /b 0
