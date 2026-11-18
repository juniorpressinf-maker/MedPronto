@echo off
title MedPronto - Liberar empacotador no antivirus
REM =====================================================================
REM  SO PARA O PC DE DESENVOLVIMENTO (onde roda o "Empacotar Instalador").
REM  NAO vai para os clientes (fica fora do pacote).
REM
REM  O Microsoft Defender analisa por dentro os instaladores gerados
REM  (~150 MB, milhares de arquivos) toda vez que sao criados, copiados ou
REM  apagados - e segura o arquivo enquanto isso. Aqui ele deixa de analisar:
REM    - os dois .exe gerados nesta pasta
REM    - as pastas temporarias que o empacotador usa
REM    - o compilador Inno Setup (ISCC) enquanto empacota
REM  Para desfazer: rode este arquivo com a palavra REMOVER:
REM    "Liberar empacotador no antivirus.bat" REMOVER
REM =====================================================================

set "ACAO=%~1"
if "%ACAO%"=="" set "ACAO=ADICIONAR"
set "TMPUSR=%~2"
if "%TMPUSR%"=="" set "TMPUSR=%TEMP%"

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Pedindo permissao de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%ACAO%','\"%TEMP%\"' -Verb RunAs"
  exit /b
)

set "RAIZ=%~dp0"
set "CMDLET=Add-MpPreference"
if /I "%ACAO%"=="REMOVER" set "CMDLET=Remove-MpPreference"

echo.
echo   Pasta do MedPronto: %RAIZ%
echo   Pasta temporaria:   %TMPUSR%
echo   Acao:               %CMDLET%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; %CMDLET% -ExclusionPath '%RAIZ%MedPronto-instalacao-completa.exe','%RAIZ%MedPronto-atualizacao.exe','%TMPUSR%\medpronto-exe-completa','%TMPUSR%\medpronto-exe-atualizacao','%TMPUSR%\medpronto-instalador-*' -ExclusionProcess 'ISCC.exe','islzma32.exe','islzma64.exe'"
if %errorlevel% neq 0 (
  echo.
  echo   NAO FOI POSSIVEL ALTERAR O ANTIVIRUS.
  echo   Se este PC usa outro antivirus - Avast, Kaspersky, etc. -
  echo   adicione as mesmas excecoes nele manualmente.
  echo.
  pause
  exit /b 1
)

echo.
if /I "%ACAO%"=="REMOVER" (
  echo   PRONTO. As excecoes do empacotador foram removidas.
) else (
  echo   PRONTO. O Windows nao vai mais travar os instaladores gerados aqui.
  echo   Apague os .exe antigos e rode o Empacotar Instalador de novo.
)
echo.
pause
