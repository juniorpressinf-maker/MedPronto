@echo off

setlocal

cd /d "%~dp0"

if not defined MEDPRONTO_QUIET echo === MedPronto: parando...

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\parar-medpronto.ps1" -InstallDir "%CD%"

if exist "data\edge-medpronto\Default\Network\Cookies" del /f "data\edge-medpronto\Default\Network\Cookies" >nul 2>&1
if exist "data\edge-medpronto\Default\Cookies" del /f "data\edge-medpronto\Default\Cookies" >nul 2>&1

if not defined MEDPRONTO_QUIET (
    echo.
    echo === MedPronto parado.
)

exit /b 0
