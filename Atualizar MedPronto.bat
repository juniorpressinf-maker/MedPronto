@echo off
setlocal
title MedPronto - Atualizacao
cd /d "%~dp0"

cls
echo.
echo ==============================================
echo   MEDPRONTO - ATUALIZACAO
echo ==============================================
echo.
echo   Use quando o MedPronto JA esta instalado.
echo.
echo   ANTES de continuar:
echo     1. Feche o MedPronto
echo        (atalho "MedPronto - parar" na Area de Trabalho)
echo     2. Prefira MedPronto-atualizacao.exe no cliente.
echo        Este .bat e o mesmo fluxo, se voce ja estiver
echo        nesta pasta do pacote.
echo.
echo   SEUS DADOS ficam preservados:
echo     pacientes, consultas, agenda e configuracoes.
echo.
echo   Na proxima tela, confirme a pasta onde o
echo   MedPronto ja esta (padrao: mesma unidade, ex. C:\MedPronto)
echo   ou escolha outra pasta.
echo.
echo   Pasta deste pacote: %CD%
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\atualizar-cliente.ps1" -PayloadDir "%~dp0"
set "RC=%ERRORLEVEL%"

if %RC% neq 0 (
    echo.
    echo ==============================================
    echo   ATUALIZACAO NAO CONCLUIDA
    echo ==============================================
    echo.
    echo   Seus dados continuam seguros em data\
    echo   Um backup foi salvo em:
    echo     backups\atualizacao-*
    echo.
    echo   Tente:
    echo     1. Fechar o MedPronto e executar de novo
    echo     2. Executar como Administrador
    echo     3. Chamar o suporte
    echo.
    pause
    exit /b %RC%
)

exit /b 0
