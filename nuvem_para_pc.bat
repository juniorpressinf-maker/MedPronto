@echo off
setlocal
title MedPronto - Nuvem para este PC
cd /d "%~dp0"

echo.
echo ============================================
echo  MedPronto - trazer a nuvem para este PC
echo ============================================
echo  1) git fetch + atualizar (codigo do GitHub)
echo  2) se veio codigo novo: compilar + migrar banco
echo.
echo  Pasta: %CD%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\nuvem-para-pc.ps1" %*
set "RC=%errorlevel%"

echo.
if %RC% equ 0 (
    echo  OK so se as linhas acima mostrarem o MESMO commit no PC e na nuvem.
    echo  Abra o MedPronto de novo pelo atalho.
) else (
    echo  Falhou. NAO esta atualizado. Veja a mensagem acima.
    echo  Se o Git perguntar Unlink of file (y/n), responda n e rode este arquivo de novo.
)
echo.
pause
exit /b %RC%
