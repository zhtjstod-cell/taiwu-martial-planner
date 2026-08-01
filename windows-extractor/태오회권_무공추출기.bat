@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title 태오회권 무공 추출기

set "ROOT=%~dp0"
set "SCRIPT_ROOT=%ROOT%"
if not exist "%SCRIPT_ROOT%extractor\extract.mjs" set "SCRIPT_ROOT=%ROOT%..\"
set "GAME_DIR=%~1"
set "RUNTIME=%ROOT%.runtime"
set "WORK=%TEMP%\TaiwuPlannerExtractor_%RANDOM%_%RANDOM%"
set "OUTPUT=%ROOT%output"
set "DATA_FILE=%OUTPUT%\태오회권_무공데이터.json"

echo.
echo [태오회권 무공 추출기]
echo 게임 파일은 읽기만 하며 계정, 세이브, 로그, 설치 경로는 결과에 넣지 않습니다.
echo.

if not defined GAME_DIR for /f "usebackq delims=" %%G in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$roots=@(); try{$roots+=(Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath}catch{}; foreach($root in @($roots)){ $vdf=Join-Path $root 'steamapps\libraryfolders.vdf'; $apps=@(Join-Path $root 'steamapps'); if(Test-Path $vdf){$raw=Get-Content -Raw $vdf; $apps+=([regex]::Matches($raw,'\"path\"\s+\"([^\"]+)\"')|ForEach-Object{(($_.Groups[1].Value -replace '\\\\','\')+'\steamapps')})}; foreach($app in $apps|Select-Object -Unique){if(Test-Path (Join-Path $app 'appmanifest_838350.acf')){Write-Output (Join-Path $app 'common\The Scroll Of Taiwu'); exit}}}"`) do set "GAME_DIR=%%G"

if not exist "%GAME_DIR%\Backend\GameData.Shared.dll" (
  echo [오류] 태오회권 설치 폴더를 찾지 못했습니다.
  echo BAT 파일 위에 게임 폴더를 끌어놓거나 다음처럼 실행하세요.
  echo 태오회권_무공추출기.bat "D:\SteamLibrary\steamapps\common\The Scroll Of Taiwu"
  pause
  exit /b 1
)

where node >nul 2>nul || goto :missing_node
where python >nul 2>nul || goto :missing_python
where dotnet >nul 2>nul || goto :missing_dotnet

if not exist "%RUNTIME%\python\Scripts\python.exe" (
  echo [1/5] 전용 Python 환경을 준비합니다...
  python -m venv "%RUNTIME%\python" || goto :failed
)
"%RUNTIME%\python\Scripts\python.exe" -m pip install --disable-pip-version-check --quiet UnityPy==1.25.0 || goto :failed

if not exist "%RUNTIME%\tools\ilspycmd.exe" (
  echo [2/5] ILSpy 분석 도구를 준비합니다...
  dotnet tool install ilspycmd --tool-path "%RUNTIME%\tools" || goto :failed
)

if exist "%WORK%" rmdir /s /q "%WORK%"
mkdir "%WORK%\data" "%WORK%\game-ui" "%OUTPUT%" >nul 2>nul

echo [3/5] 전체 무공과 정/역련 전투 코드를 분석합니다...
set "ILSPYCMD=%RUNTIME%\tools\ilspycmd.exe"
node "%SCRIPT_ROOT%extractor\extract.mjs" --game "%GAME_DIR%" --out "%WORK%\data\combat-skills.json" --cache "%LOCALAPPDATA%\TaiwuPlannerExtractor\cache" --portable "%DATA_FILE%" || goto :failed

echo [4/5] 인게임 무공 아이콘을 추출합니다...
"%RUNTIME%\python\Scripts\python.exe" "%SCRIPT_ROOT%extractor\extract-ui-assets.py" --game "%GAME_DIR%" --out "%WORK%\game-ui" || goto :failed

echo [5/5] 사이트 업로드용 파일을 완성합니다...
node "%SCRIPT_ROOT%extractor\embed-portable-assets.mjs" --data "%DATA_FILE%" --assets "%WORK%\game-ui" || goto :failed

rmdir /s /q "%WORK%" >nul 2>nul
echo.
echo 완료: "%DATA_FILE%"
echo 사이트의 [데이터 업로드] 버튼에서 이 JSON 파일을 선택하세요.
start "" explorer.exe /select,"%DATA_FILE%"
pause
exit /b 0

:missing_node
echo [오류] Node.js 22 이상이 필요합니다: https://nodejs.org/
goto :requirements
:missing_python
echo [오류] Python 3.11 이상이 필요합니다: https://www.python.org/downloads/windows/
goto :requirements
:missing_dotnet
echo [오류] .NET 8 SDK가 필요합니다: https://dotnet.microsoft.com/download/dotnet/8.0
:requirements
echo 설치 후 BAT 파일을 다시 실행해 주세요. 추출기 자체는 관리자 권한을 요구하지 않습니다.
pause
exit /b 2

:failed
echo.
echo [오류] 추출 도중 문제가 발생했습니다. 위 오류 문구와 게임 버전을 GitHub Issues에 알려주세요.
if exist "%WORK%" rmdir /s /q "%WORK%" >nul 2>nul
pause
exit /b 3
