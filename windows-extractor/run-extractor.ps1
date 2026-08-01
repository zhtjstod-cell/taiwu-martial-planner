[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$GameDir,
  [switch]$NoPause
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$utf8 = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$root = $PSScriptRoot
$projectRoot = $root
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "extractor\extract.mjs") -PathType Leaf)) {
  $projectRoot = Split-Path $root -Parent
}

$runtime = Join-Path $root ".runtime"
$output = Join-Path $root "output"
$dataFile = Join-Path $output "태오회권_무공데이터.json"
$work = $null

function Pause-IfNeeded {
  if (-not $NoPause -and [Environment]::UserInteractive) {
    [void](Read-Host "계속하려면 Enter 키를 누르세요")
  }
}

function Exit-Extractor {
  param([int]$Code)
  Pause-IfNeeded
  exit $Code
}

function Get-RequiredCommand {
  param([string]$Name, [string]$InstallMessage)
  $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $command) { throw $InstallMessage }
  return $command.Source
}

function Invoke-Checked {
  param([string]$FilePath, [string[]]$Arguments)
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "명령 실행에 실패했습니다 ($LASTEXITCODE): $FilePath" }
}

Write-Host ""
Write-Host "[태오회권 무공 추출기]"
Write-Host "게임 파일은 읽기만 하며 계정, 세이브, 로그, 설치 경로는 결과에 넣지 않습니다."
Write-Host ""

if ([string]::IsNullOrWhiteSpace($GameDir)) {
  $finder = Join-Path $root "find-taiwu-game.ps1"
  try { $GameDir = & $finder | Select-Object -First 1 } catch { $GameDir = $null }
}

if ([string]::IsNullOrWhiteSpace($GameDir) -or
    -not (Test-Path -LiteralPath (Join-Path $GameDir "Backend\GameData.Shared.dll") -PathType Leaf)) {
  Write-Host "[오류] 태오회권 설치 폴더를 찾지 못했습니다." -ForegroundColor Red
  Write-Host "BAT 파일 위에 게임 폴더를 끌어놓거나 다음처럼 실행하세요."
  Write-Host '태오회권_무공추출기.bat "D:\SteamLibrary\steamapps\common\The Scroll Of Taiwu"'
  Exit-Extractor 1
}
$GameDir = (Resolve-Path -LiteralPath $GameDir).Path

try {
  $node = Get-RequiredCommand "node" "Node.js 22.13 이상이 필요합니다: https://nodejs.org/"
  $nodeVersion = [version]((& $node --version).Trim().TrimStart('v'))
  if ($nodeVersion -lt [version]"22.13.0") { throw "Node.js 22.13 이상이 필요합니다. 현재 버전: $nodeVersion" }

  $python = Get-RequiredCommand "python" "Python 3.11 이상이 필요합니다: https://www.python.org/downloads/windows/"
  $pythonLine = ((& $python --version 2>&1) | Select-Object -First 1).ToString()
  if ($pythonLine -notmatch '(\d+\.\d+\.\d+)') { throw "Python 버전을 확인하지 못했습니다." }
  $pythonVersion = [version]$Matches[1]
  if ($pythonVersion -lt [version]"3.11.0") { throw "Python 3.11 이상이 필요합니다. 현재 버전: $pythonVersion" }

  $dotnet = Get-RequiredCommand "dotnet" ".NET 8 SDK가 설치되어 있지 않습니다: https://dotnet.microsoft.com/download/dotnet/8.0"
  $sdkLines = @(& $dotnet --list-sdks 2>$null)
  if ($LASTEXITCODE -ne 0 -or $sdkLines.Count -eq 0) {
    throw ".NET 실행 환경만 있고 SDK가 없거나 dotnet이 손상되었습니다. .NET 8 SDK를 설치하세요: https://dotnet.microsoft.com/download/dotnet/8.0"
  }
  $supportedSdk = $false
  foreach ($line in $sdkLines) {
    if ($line -match '^(\d+\.\d+\.\d+)') {
      if ([version]$Matches[1] -ge [version]"8.0.0") { $supportedSdk = $true; break }
    }
  }
  if (-not $supportedSdk) {
    throw ".NET 8 이상 SDK가 필요합니다. 감지된 SDK: $($sdkLines -join ', ')`nhttps://dotnet.microsoft.com/download/dotnet/8.0"
  }
} catch {
  Write-Host "[필수 프로그램 오류] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "설치 후 추출기를 다시 실행해 주세요. 관리자 권한은 필요하지 않습니다."
  Exit-Extractor 2
}

try {
  $venvPython = Join-Path $runtime "python\Scripts\python.exe"
  if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
    Write-Host "[1/5] 전용 Python 환경을 준비합니다..."
    Invoke-Checked $python @("-m", "venv", (Join-Path $runtime "python"))
  }
  Invoke-Checked $venvPython @("-m", "pip", "install", "--disable-pip-version-check", "--quiet", "UnityPy==1.25.0")

  $toolDir = Join-Path $runtime "tools"
  $ilspy = Join-Path $toolDir "ilspycmd.exe"
  if (-not (Test-Path -LiteralPath $ilspy -PathType Leaf)) {
    Write-Host "[2/5] ILSpy 분석 도구를 준비합니다..."
    Invoke-Checked $dotnet @("tool", "install", "ilspycmd", "--tool-path", $toolDir)
  }

  $work = Join-Path ([IO.Path]::GetTempPath()) ("TaiwuPlannerExtractor_" + [guid]::NewGuid().ToString("N"))
  $workData = Join-Path $work "data"
  $workUi = Join-Path $work "game-ui"
  [void](New-Item -ItemType Directory -Path $workData, $workUi, $output -Force)

  Write-Host "[3/5] 전체 무공과 정/역련 전투 코드를 분석합니다..."
  $env:ILSPYCMD = $ilspy
  Invoke-Checked $node @(
    (Join-Path $projectRoot "extractor\extract.mjs"),
    "--game", $GameDir,
    "--out", (Join-Path $workData "combat-skills.json"),
    "--cache", (Join-Path $env:LOCALAPPDATA "TaiwuPlannerExtractor\cache"),
    "--portable", $dataFile
  )

  Write-Host "[4/5] 인게임 무공 아이콘을 추출합니다..."
  Invoke-Checked $venvPython @(
    (Join-Path $projectRoot "extractor\extract-ui-assets.py"),
    "--game", $GameDir,
    "--out", $workUi
  )

  Write-Host "[5/5] 사이트 업로드용 파일을 완성합니다..."
  Invoke-Checked $node @(
    (Join-Path $projectRoot "extractor\embed-portable-assets.mjs"),
    "--data", $dataFile,
    "--assets", $workUi
  )

  Write-Host ""
  Write-Host "완료: $dataFile" -ForegroundColor Green
  Write-Host "사이트의 [데이터 업로드] 버튼에서 이 JSON 파일을 선택하세요."
  Start-Process explorer.exe -ArgumentList "/select,`"$dataFile`""
} catch {
  Write-Host ""
  Write-Host "[오류] 추출 도중 문제가 발생했습니다." -ForegroundColor Red
  Write-Host $_.Exception.Message
  Write-Host "위 오류 문구와 게임 버전을 GitHub Issues에 알려주세요."
  Exit-Extractor 3
} finally {
  if ($work -and (Test-Path -LiteralPath $work)) {
    $resolvedWork = (Resolve-Path -LiteralPath $work).Path
    $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedWork.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedWork -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

Exit-Extractor 0
