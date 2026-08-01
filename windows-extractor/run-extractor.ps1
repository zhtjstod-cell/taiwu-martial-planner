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
  $node = Join-Path $runtime "node\node.exe"
  $dotnetRoot = Join-Path $runtime "dotnet"
  $dotnet = Join-Path $dotnetRoot "dotnet.exe"
  $ilspy = Join-Path $runtime "ilspy\ilspycmd.exe"
  $uiExtractor = Join-Path $runtime "ui\taiwu-ui-extractor\taiwu-ui-extractor.exe"
  foreach ($required in @($node, $dotnet, $ilspy, $uiExtractor)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
      throw "내장 실행 파일이 없습니다: $required"
    }
  }
  $env:DOTNET_ROOT = $dotnetRoot
  $env:PATH = "$dotnetRoot;$($env:PATH)"
} catch {
  Write-Host "[내장 실행환경 오류] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "릴리스 ZIP을 다시 받아 완전히 압축 해제해 주세요. 별도 프로그램 설치는 필요하지 않습니다."
  Exit-Extractor 2
}

try {
  $work = Join-Path ([IO.Path]::GetTempPath()) ("TaiwuPlannerExtractor_" + [guid]::NewGuid().ToString("N"))
  $workData = Join-Path $work "data"
  $workUi = Join-Path $work "game-ui"
  [void](New-Item -ItemType Directory -Path $workData, $workUi, $output -Force)

  Write-Host "[1/3] 전체 무공과 정/역련 전투 코드를 분석합니다..."
  $env:ILSPYCMD = $ilspy
  Invoke-Checked $node @(
    (Join-Path $projectRoot "extractor\extract.mjs"),
    "--game", $GameDir,
    "--out", (Join-Path $workData "combat-skills.json"),
    "--cache", (Join-Path $env:LOCALAPPDATA "TaiwuPlannerExtractor\cache"),
    "--portable", $dataFile
  )

  Write-Host "[2/3] 인게임 무공 아이콘을 추출합니다..."
  Invoke-Checked $uiExtractor @(
    "--game", $GameDir,
    "--out", $workUi
  )

  Write-Host "[3/3] 사이트 업로드용 파일을 완성합니다..."
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
