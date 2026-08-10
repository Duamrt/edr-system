@echo off
chcp 65001 >nul
setlocal

REM melhorar-video.bat — EDR Engenharia
REM Arraste um ou mais videos para cima deste arquivo.

if "%~1"=="" (
  echo.
  echo   Arraste os videos para cima deste arquivo ^(melhorar-video.bat^).
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0melhorar-video.ps1" %*

echo.
pause
