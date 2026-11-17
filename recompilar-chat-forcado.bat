@echo off
echo ========================================
echo   RECOMPILAR CHAT v3 - FORCADO (sem cache)
echo ========================================
echo.

set "NODE_PATH=d:\MedPronto\node"
set "PATH=%NODE_PATH%;%PATH%"

echo [1/3] Limpando cache do Vite...
if exist "d:\MedPronto\frontend\.vite" rmdir /s /q "d:\MedPronto\frontend\.vite"
if exist "d:\MedPronto\frontend\node_modules\.vite" rmdir /s /q "d:\MedPronto\frontend\node_modules\.vite"
echo Cache limpo.
echo.

echo [2/3] Recompilando FRONTEND (forcado)...
cd /d d:\MedPronto
call npm run build -w frontend -- --force
if %ERRORLEVEL% neq 0 (
    echo ERRO no build do frontend!
    pause
    exit /b 1
)
echo Frontend compilado com sucesso.
echo.

echo [3/3] Recompilando BACKEND...
call npm run build -w backend
if %ERRORLEVEL% neq 0 (
    echo ERRO no build do backend!
    pause
    exit /b 1
)
echo Backend compilado com sucesso.
echo.

echo ========================================
echo   BUILD FORCADO CONCLUIDO
echo ========================================
echo.
echo Agora rode PARAR.BAT e depois INICIAR.VBS
echo.
pause