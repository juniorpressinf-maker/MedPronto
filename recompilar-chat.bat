@echo off
echo ========================================
echo   RECOMPILAR CHAT v3 - MedPronto
echo ========================================
echo.

set "NODE_PATH=d:\MedPronto\node"
set "PATH=%NODE_PATH%;%PATH%"

echo [1/2] Recompilando FRONTEND...
cd /d d:\MedPronto
call npm run build -w frontend
if %ERRORLEVEL% neq 0 (
    echo ERRO no build do frontend!
    pause
    exit /b 1
)
echo Frontend compilado com sucesso.
echo.

echo [2/2] Recompilando BACKEND...
call npm run build -w backend
if %ERRORLEVEL% neq 0 (
    echo ERRO no build do backend!
    pause
    exit /b 1
)
echo Backend compilado com sucesso.
echo.

echo ========================================
echo   BUILD CONCLUIDO COM SUCESSO
echo ========================================
echo.
echo Agora rode PARAR.BAT e depois INICIAR.VBS
echo.
pause