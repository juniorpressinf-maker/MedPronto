@echo off
setlocal
cd /d "%~dp0"
if exist "node\node.exe" (
  set "NODE=node\node.exe"
) else (
  set "NODE=node"
)
"%NODE%" scripts\reset-acesso.mjs
pause
