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

node="$runtime/node/node"
dotnet_root="$runtime/dotnet"
dotnet="$dotnet_root/dotnet"
ilspy="$runtime/ilspy/ilspycmd"
ui_extractor="$runtime/ui/taiwu-ui-extractor/taiwu-ui-extractor"
for required in "$node" "$dotnet" "$ilspy" "$ui_extractor"; do
  if [[ ! -x "$required" ]]; then
    printf '\n[내장 실행환경 오류] 실행 파일이 없습니다: %s\n' "$required" >&2
    printf '릴리스 압축 파일을 다시 받아 완전히 압축 해제하세요. 별도 프로그램 설치는 필요하지 않습니다.\n' >&2
    exit 2
  fi
done
export DOTNET_ROOT="$dotnet_root"
export PATH="$dotnet_root:$PATH"

work="$(mktemp -d "${TMPDIR:-/tmp}/TaiwuPlannerExtractor.XXXXXX")"
mkdir -p -- "$work/data" "$work/game-ui" "$output"

if [[ -n "${XDG_CACHE_HOME:-}" ]]; then
  cache_root="$XDG_CACHE_HOME/TaiwuPlannerExtractor/cache"
elif [[ -n "${HOME:-}" ]]; then
  cache_root="$HOME/.cache/TaiwuPlannerExtractor/cache"
else
  cache_root="$runtime/cache"
fi

printf '[1/3] 전체 무공과 정/역련 전투 코드를 분석합니다...\n'
ILSPYCMD="$ilspy" "$node" "$project_root/extractor/extract.mjs" \
  --game "$game_dir" \
  --out "$work/data/combat-skills.json" \
  --cache "$cache_root" \
  --portable "$data_file"

printf '[2/3] 인게임 무공 아이콘을 추출합니다...\n'
"$ui_extractor" --game "$game_dir" --out "$work/game-ui"

printf '[3/3] 사이트 업로드용 파일을 완성합니다...\n'
"$node" "$project_root/extractor/embed-portable-assets.mjs" --data "$data_file" --assets "$work/game-ui"

printf '\n완료: %s\n' "$data_file"
printf '사이트의 [데이터 업로드] 버튼에서 이 JSON 파일을 선택하세요.\n'
