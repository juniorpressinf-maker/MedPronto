@echo off
title MedPronto - Empacotar Instalador
cd /d "%~dp0"
REM Janela sem "Edicao Rapida": clique do mouse nao pausa mais o processo.
REM Reabre numa janela com titulo proprio; o registro (so desse titulo) tem QuickEdit=0.
if not "%MP_SEM_EDICAO%"=="1" (
    reg add "HKCU\Console\MedPronto - Empacotar Instalador" /v QuickEdit /t REG_DWORD /d 0 /f >nul 2>&1
    set "MP_SEM_EDICAO=1"
    start "MedPronto - Empacotar Instalador" "%ComSpec%" /c ""%~f0" %*"
    exit /b 0
)

echo.
echo ==============================================
echo   MEDPRONTO - EMPACOTAR INSTALADOR
echo ==============================================
echo.
echo   Gera os instaladores para o cliente:
echo     MedPronto-instalacao-completa.exe  (computador novo)
echo     MedPronto-atualizacao.exe          (clinica que ja usa o sistema)
echo.
echo   No cliente: baixa o EXE e executa. Assistente com barra de progresso
echo   (pasta, copia dos arquivos, banco e atalhos).
echo.
echo   Aqui tambem aparece uma janela de progresso o tempo todo.
echo   Demora alguns minutos. Cada EXE ~120-200 MB.
echo.
echo   Saida na pasta do projeto.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0empacotar-instalador.ps1" -ModoCompactacao rapido %* 2> "%~dp0ULTIMO-ERRO-EMPACOTE.txt"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
    echo.
    echo EXE: %~dp0MedPronto-instalacao-completa.exe
    echo EXE: %~dp0MedPronto-atualizacao.exe
    echo.
    echo Janela fecha em 8 segundos...
    timeout /t 8 /nobreak >nul
    exit /b 0
)

echo.
echo ==============================================
echo   EMPACOTAMENTO FALHOU ^(codigo %RC%^)
echo ==============================================
echo   Veja a mensagem acima ou:
echo   %~dp0ULTIMO-ERRO-EMPACOTE.txt
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\console-ajustes.ps1" -Acao LimparTeclas >nul 2>&1
echo Pressione qualquer tecla para fechar...
pause >nul
exit /b %RC%
