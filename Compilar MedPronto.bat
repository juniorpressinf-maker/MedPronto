@echo off
setlocal
title MedPronto - Compilar
cd /d "%~dp0"
REM Janela sem "Edicao Rapida": clique do mouse nao pausa mais o processo.
REM Reabre numa janela com titulo proprio; o registro (so desse titulo) tem QuickEdit=0.
if not "%MP_SEM_EDICAO%"=="1" (
    reg add "HKCU\Console\MedPronto - Compilar" /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1
    set "MP_SEM_EDICAO=1"
    start "MedPronto - Compilar" "%ComSpec%" /c ""%~f0""
    exit /b 0
)
set "LOGC=%~dp0ULTIMO-ERRO-COMPILAR.txt"
if exist "%LOGC%" del /q "%LOGC%" >nul 2>&1

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
REM Mostra na tela e grava em ULTIMO-ERRO-COMPILAR.txt (apagado se der certo).
powershell -NoProfile -ExecutionPolicy Bypass -Command "cmd /c 'npm run build -w backend 2>&1' | Tee-Object -FilePath $env:LOGC -Append; exit $LASTEXITCODE"
if errorlevel 1 goto erro
echo       servidor compilado.
echo.

echo [3/4] Compilando a TELA (frontend)... aguarde.
powershell -NoProfile -ExecutionPolicy Bypass -Command "cmd /c 'npm run build -w frontend 2>&1' | Tee-Object -FilePath $env:LOGC -Append; exit $LASTEXITCODE"
if errorlevel 1 goto erro
echo       tela compilada.
echo.

echo ==============================================
echo   COMPILADO COM SUCESSO
echo ==============================================
echo.
if exist "%LOGC%" del /q "%LOGC%" >nul 2>&1
REM Descarta teclas apertadas durante a compilacao (nao responder S/N sozinho).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\console-ajustes.ps1" -Acao LimparTeclas >nul 2>&1
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
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\console-ajustes.ps1" -Acao LimparTeclas >nul 2>&1
pause
exit /b 0

:erro
echo.
echo ==============================================
echo   ERRO NA COMPILACAO - veja a mensagem acima.
echo   Nada foi alterado no MedPronto em uso.
echo   O erro tambem ficou gravado em ULTIMO-ERRO-COMPILAR.txt
echo ==============================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\console-ajustes.ps1" -Acao LimparTeclas >nul 2>&1
pause
exit /b 1
