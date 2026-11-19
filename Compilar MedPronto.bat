@echo off
setlocal
title MedPronto - Compilar
cd /d "%~dp0"

REM =====================================================================
REM  COMPILAR MEDPRONTO - arquivo unico (substitui compilar.bat,
REM  recompilar-chat.bat e recompilar-chat-forcado.bat).
REM    1. limpa o cache da tela (nunca sobra versao velha)
REM    2. compila o servidor (backend)
REM    3. compila a tela (frontend)
REM    4. reinicia o MedPronto para as mudancas valerem
REM  Se der erro, para na hora e NAO mexe no MedPronto em uso.
REM =====================================================================

echo.
echo ==============================================
echo   MEDPRONTO - COMPILAR
echo ==============================================
echo.

if exist "%~dp0node\node.exe" (
    set "PATH=%~dp0node;%PATH%"
    echo   Node portatil: .\node\
) else (
    where node >nul 2>&1
    if errorlevel 1 (
        echo.
        echo   ERRO: Node nao encontrado.
        echo   Execute primeiro: Instalar MedPronto.bat
        echo.
        pause
        exit /b 1
    )
    echo   Node do sistema
)
echo.

echo [1/4] Limpando cache da tela...
if exist "frontend\node_modules\.vite" rmdir /s /q "frontend\node_modules\.vite"
if exist "frontend\node_modules\.tmp" rmdir /s /q "frontend\node_modules\.tmp"
if exist "frontend\.vite" rmdir /s /q "frontend\.vite"
echo       ok
echo.

echo [2/4] Compilando o SERVIDOR (backend)... aguarde.
call npm run build -w backend
if errorlevel 1 goto erro
echo       servidor compilado.
echo.

echo [3/4] Compilando a TELA (frontend)... aguarde.
call npm run build -w frontend
if errorlevel 1 goto erro
echo       tela compilada.
echo.

echo ==============================================
echo   COMPILADO COM SUCESSO
echo ==============================================
echo.
echo [4/4] Reiniciar o MedPronto agora para as mudancas valerem?
echo       Quem estiver usando o sistema perde o que nao salvou.
echo.
choice /C SN /T 15 /D S /M "      Reiniciar agora (sem resposta em 15 s = Sim)"
if errorlevel 2 goto sem_reiniciar

echo.
echo       Parando o MedPronto...
set "MEDPRONTO_QUIET=1"
call "%~dp0parar.bat"
set "MEDPRONTO_QUIET="
echo       Abrindo o MedPronto...
start "" wscript.exe "%~dp0iniciar.vbs"
echo.
echo   PRONTO! O MedPronto esta abrindo com a versao nova.
echo   Nos outros computadores, basta apertar Ctrl+F5.
echo.
timeout /t 8 >nul
exit /b 0

:sem_reiniciar
echo.
echo   Ok, nao reiniciei. Para as mudancas valerem:
echo     - mudou so a tela: Ctrl+F5 no navegador;
echo     - mudou o servidor: feche o MedPronto pelo atalho de parar e abra de novo.
echo.
pause
exit /b 0

:erro
echo.
echo ==============================================
echo   ERRO NA COMPILACAO - veja a mensagem acima.
echo   Nada foi alterado no MedPronto em uso.
echo ==============================================
echo.
pause
exit /b 1
