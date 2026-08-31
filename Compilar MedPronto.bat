@echo off
setlocal
title MedPronto - Compilar
cd /d "%~dp0"

echo.
echo ==============================================
echo   MEDPRONTO - COMPILACAO
echo ==============================================
echo.
echo   Use quando o codigo do sistema foi alterado
echo   e voce precisa atualizar a versao em producao.
echo.
echo   Nao e necessario abrir Prompt ou digitar npm.
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
echo   Compilando backend e frontend... aguarde.
echo.

call npm run build
set "RC=%ERRORLEVEL%"

if %RC% neq 0 (
    echo.
    echo ==============================================
    echo   ERRO na compilacao
    echo ==============================================
    echo.
    echo   Veja data\medpronto.log ou ULTIMO-ERRO.txt
    echo.
    pause
    exit /b %RC%
)

echo.
echo ==============================================
echo   Compilacao concluida!
echo ==============================================
echo.
echo   Proximo passo:
echo     1. Feche o MedPronto ^(atalho parar ou parar.bat^)
echo     2. Abra de novo pelo atalho MedPronto
echo.
pause
exit /b 0
