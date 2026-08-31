@echo off
setlocal
cd /d "%~dp0"

echo === Zerar base (cliente novo) ===
echo.
echo Parando o Agenda...
call parar.bat
echo.

if exist "node\node.exe" (
  set "NODE=node\node.exe"
) else (
  set "NODE=node"
)

"%NODE%" scripts\zerar-base.mjs
if errorlevel 1 (
  echo.
  echo *** ERRO ao zerar a base ***
  pause
  exit /b 1
)

echo.
echo Use o atalho Agenda para iniciar do zero.
pause
