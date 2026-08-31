@echo off
title MedPronto - Empacotar Instalador
cd /d "%~dp0"

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
echo Pressione qualquer tecla para fechar...
pause >nul
exit /b %RC%
