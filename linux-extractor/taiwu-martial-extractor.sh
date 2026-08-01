#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
project_root="$script_dir"
[[ -f "$project_root/extractor/extract.mjs" ]] || project_root="$(cd -- "$script_dir/.." && pwd -P)"

runtime="$script_dir/.runtime"
output="$script_dir/output"
data_file="$output/태오회권_무공데이터.json"
work=""

cleanup() {
  if [[ -n "$work" && -d "$work" ]]; then
    case "$work" in
      "${TMPDIR:-/tmp}"/TaiwuPlannerExtractor.*) rm -rf -- "$work" ;;
    esac
  fi
}
trap cleanup EXIT INT TERM

fail_requirement() {
  printf '\n[필수 프로그램 오류] %s\n' "$1" >&2
  printf '필수 프로그램 설치 후 추출기를 다시 실행하세요. 추출기 자체는 root 권한을 요구하지 않습니다.\n' >&2
  exit 2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail_requirement "$2"
}

version_at_least() {
  local actual="$1" required_major="$2" required_minor="$3"
  local major minor rest
  IFS=. read -r major minor rest <<<"${actual#v}"
  [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]] || return 1
  (( major > required_major || (major == required_major && minor >= required_minor) ))
}

printf '\n[태오회권 무공 추출기 · Linux/Proton]\n'
printf '게임 파일은 읽기만 하며 계정, 세이브, 로그, 설치 경로는 결과에 넣지 않습니다.\n\n'

game_dir="${1:-${TAIWU_GAME_DIR:-}}"
if [[ -z "$game_dir" ]]; then
  if discovered="$($script_dir/find-taiwu-game.sh)"; then game_dir="$discovered"; fi
fi

if [[ -z "$game_dir" || ! -f "$game_dir/Backend/GameData.Shared.dll" ]]; then
  printf '[오류] 태오회권 설치 폴더를 찾지 못했습니다.\n' >&2
  printf '다음처럼 게임 설치 폴더를 직접 지정하세요.\n' >&2
  printf 'bash taiwu-martial-extractor.sh "/mnt/games/SteamLibrary/steamapps/common/The Scroll Of Taiwu"\n' >&2
  exit 1
fi
game_dir="$(cd -- "$game_dir" && pwd -P)"

require_command node 'Node.js 22.13 이상이 필요합니다: https://nodejs.org/'
node_version="$(node --version)"
version_at_least "$node_version" 22 13 || fail_requirement "Node.js 22.13 이상이 필요합니다. 현재 버전: $node_version"

require_command python3 'Python 3.11 이상과 venv가 필요합니다.'
python_version="$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
version_at_least "$python_version" 3 11 || fail_requirement "Python 3.11 이상이 필요합니다. 현재 버전: $python_version"

require_command dotnet '.NET 8 SDK가 필요합니다: https://dotnet.microsoft.com/download/dotnet/8.0'
sdk_list="$(dotnet --list-sdks 2>/dev/null || true)"
[[ -n "$sdk_list" ]] || fail_requirement '.NET Runtime만 설치되어 있거나 SDK가 없습니다. .NET 8 SDK를 설치하세요.'
supported_sdk=false
while IFS= read -r sdk_line; do
  sdk_version="${sdk_line%% *}"
  if version_at_least "$sdk_version" 8 0; then supported_sdk=true; break; fi
done <<<"$sdk_list"
[[ "$supported_sdk" == true ]] || fail_requirement ".NET 8 이상 SDK가 필요합니다. 감지된 SDK: ${sdk_list//$'\n'/, }"

venv_python="$runtime/python/bin/python"
if [[ ! -x "$venv_python" ]]; then
  printf '[1/5] 전용 Python 환경을 준비합니다...\n'
  if ! python3 -m venv "$runtime/python"; then
    fail_requirement 'Python venv 생성에 실패했습니다. Debian/Ubuntu 계열은 python3-venv 패키지를 설치하세요.'
  fi
fi
"$venv_python" -m pip install --disable-pip-version-check --quiet UnityPy==1.25.0

tool_dir="$runtime/tools"
ilspy="$tool_dir/ilspycmd"
if [[ ! -x "$ilspy" ]]; then
  printf '[2/5] ILSpy 분석 도구를 준비합니다...\n'
  dotnet tool install ilspycmd --tool-path "$tool_dir"
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/TaiwuPlannerExtractor.XXXXXX")"
mkdir -p -- "$work/data" "$work/game-ui" "$output"

if [[ -n "${XDG_CACHE_HOME:-}" ]]; then
  cache_root="$XDG_CACHE_HOME/TaiwuPlannerExtractor/cache"
elif [[ -n "${HOME:-}" ]]; then
  cache_root="$HOME/.cache/TaiwuPlannerExtractor/cache"
else
  cache_root="$runtime/cache"
fi

printf '[3/5] 전체 무공과 정/역련 전투 코드를 분석합니다...\n'
ILSPYCMD="$ilspy" node "$project_root/extractor/extract.mjs" \
  --game "$game_dir" \
  --out "$work/data/combat-skills.json" \
  --cache "$cache_root" \
  --portable "$data_file"

printf '[4/5] 인게임 무공 아이콘을 추출합니다...\n'
"$venv_python" "$project_root/extractor/extract-ui-assets.py" --game "$game_dir" --out "$work/game-ui"

printf '[5/5] 사이트 업로드용 파일을 완성합니다...\n'
node "$project_root/extractor/embed-portable-assets.mjs" --data "$data_file" --assets "$work/game-ui"

printf '\n완료: %s\n' "$data_file"
printf '사이트의 [데이터 업로드] 버튼에서 이 JSON 파일을 선택하세요.\n'
