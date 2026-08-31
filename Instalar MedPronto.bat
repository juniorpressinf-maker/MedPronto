@echo off
setlocal
title MedPronto - Instalacao
cd /d "%~dp0"

cls
echo.
echo ==============================================
echo   MEDPRONTO - INSTALACAO ( primeira vez )
echo ==============================================
echo.
echo   Use quando o MedPronto AINDA NAO esta
echo   instalado neste computador.
echo.
echo   O que sera feito:
echo     - Escolher pasta de instalacao
echo       (padrao: mesma unidade, ex. C:\MedPronto)
echo     - Copiar arquivos do pacote
echo     - Configurar banco de dados
echo     - Criar atalhos na Area de Trabalho
echo     - Gravar a pasta no Windows (para atualizar depois)
echo.
echo   Se a pasta de destino JA existir e tiver
echo   arquivos, o instalador AVISA DUAS VEZES
echo   antes de APAGAR os dados (instalacao do zero).
echo   Ele tambem fecha o MedPronto se ainda estiver
echo   aberto nessa pasta (senao a copia falha).
echo   Para manter dados, use MedPronto-atualizacao.exe
echo   (ou Atualizar MedPronto.bat nesta pasta).
echo.
echo   Pasta deste pacote: %CD%
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\instalar-cliente.ps1"
set "RC=%ERRORLEVEL%"

if %RC% neq 0 (
    echo.
    echo ==============================================
    echo   INSTALACAO NAO CONCLUIDA
    echo ==============================================
    echo.
    echo   Tente:
    echo     1. Executar como Administrador
    echo     2. Escolher outra pasta (ex.: C:\MedPronto)
    echo     3. Ver logs em logs\ da pasta escolhida
    echo.
    pause
    exit /b %RC%
)

exit /b 0
