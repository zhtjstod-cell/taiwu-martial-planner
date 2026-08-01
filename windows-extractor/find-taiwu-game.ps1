[CmdletBinding()]
param(
  [string[]]$AdditionalRoots = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$roots = [System.Collections.Generic.List[string]]::new()

function Add-SteamRoot {
  param([AllowEmptyString()][string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  $expanded = [Environment]::ExpandEnvironmentVariables($Path.Trim().Trim('"'))
  if (-not $roots.Contains($expanded)) { $roots.Add($expanded) }
}

if ($env:TAIWU_STEAM_ROOTS) {
  foreach ($candidate in $env:TAIWU_STEAM_ROOTS -split ';') { Add-SteamRoot $candidate }
}
foreach ($candidate in $AdditionalRoots) { Add-SteamRoot $candidate }

foreach ($key in @(
  "HKCU:\Software\Valve\Steam",
  "HKLM:\SOFTWARE\WOW6432Node\Valve\Steam",
  "HKLM:\SOFTWARE\Valve\Steam"
)) {
  try {
    $steam = Get-ItemProperty -LiteralPath $key -ErrorAction Stop
    Add-SteamRoot $steam.SteamPath
    Add-SteamRoot $steam.InstallPath
  } catch {
    # Registry locations differ between Steam installations.
  }
}

if (${env:ProgramFiles(x86)}) { Add-SteamRoot (Join-Path ${env:ProgramFiles(x86)} "Steam") }
if ($env:ProgramFiles) { Add-SteamRoot (Join-Path $env:ProgramFiles "Steam") }

$steamApps = [System.Collections.Generic.List[string]]::new()
function Add-SteamApps {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  $candidate = $Path.TrimEnd('\', '/')
  if ((Split-Path $candidate -Leaf) -ne "steamapps") { $candidate = Join-Path $candidate "steamapps" }
  if (-not $steamApps.Contains($candidate)) { $steamApps.Add($candidate) }
}

foreach ($root in $roots) {
  Add-SteamApps $root
  $steamRoot = if ((Split-Path $root.TrimEnd('\', '/') -Leaf) -eq "steamapps") { Split-Path $root -Parent } else { $root }
  $vdf = Join-Path $steamRoot "steamapps\libraryfolders.vdf"
  if (-not (Test-Path -LiteralPath $vdf -PathType Leaf)) { continue }
  try {
    $raw = Get-Content -LiteralPath $vdf -Raw -ErrorAction Stop
    foreach ($match in [regex]::Matches($raw, '"path"\s+"([^"]+)"')) {
      Add-SteamApps ($match.Groups[1].Value -replace '\\\\', '\')
    }
  } catch {
    # A manually supplied path can still be used when the VDF is unreadable.
  }
}

foreach ($apps in $steamApps) {
  $manifest = Join-Path $apps "appmanifest_838350.acf"
  $game = Join-Path $apps "common\The Scroll Of Taiwu"
  $sharedDll = Join-Path $game "Backend\GameData.Shared.dll"
  if ((Test-Path -LiteralPath $manifest -PathType Leaf) -and (Test-Path -LiteralPath $sharedDll -PathType Leaf)) {
    (Resolve-Path -LiteralPath $game).Path
    exit 0
  }
}

exit 1
