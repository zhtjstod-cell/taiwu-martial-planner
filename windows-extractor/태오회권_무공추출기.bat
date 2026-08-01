@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Taiwu Martial Arts Extractor

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Windows PowerShell could not be found.
  echo Run windows-extractor\run-extractor.ps1 from PowerShell.
  pause
  exit /b 2
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-extractor.ps1" -NoPause -GameDir "%~1"
set "EXTRACTOR_EXIT=%ERRORLEVEL%"

echo.
if not "%EXTRACTOR_EXIT%"=="0" echo Extractor exited with code %EXTRACTOR_EXIT%.
pause
exit /b %EXTRACTOR_EXIT%
