@echo off
cd /d "%~dp0"
echo === Consulta de teste (paciente na fila hoje) ===
call npm run preparar-teste
echo.
echo Entre como medico / medico123 e abra Fila do dia
pause
