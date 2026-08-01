#!/usr/bin/env bash
set -Eeuo pipefail

declare -a steam_roots=()

add_root() {
  local candidate="${1:-}"
  [[ -n "$candidate" ]] || return 0
  candidate="${candidate%/}"
  local existing
  for existing in "${steam_roots[@]:-}"; do
    [[ "$existing" == "$candidate" ]] && return 0
  done
  steam_roots+=("$candidate")
}

if [[ -n "${TAIWU_STEAM_ROOTS:-}" ]]; then
  IFS=':' read -r -a configured_roots <<<"$TAIWU_STEAM_ROOTS"
  for root in "${configured_roots[@]}"; do add_root "$root"; done
fi

if [[ -n "${HOME:-}" ]]; then
  add_root "$HOME/.steam/steam"
  add_root "$HOME/.local/share/Steam"
  add_root "$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam"
fi

declare -a steamapps_dirs=()
add_steamapps() {
  local candidate="${1%/}"
  [[ "${candidate##*/}" == "steamapps" ]] || candidate="$candidate/steamapps"
  local existing
  for existing in "${steamapps_dirs[@]:-}"; do
    [[ "$existing" == "$candidate" ]] && return 0
  done
  steamapps_dirs+=("$candidate")
}

for root in "${steam_roots[@]:-}"; do
  add_steamapps "$root"
  [[ "${root##*/}" == "steamapps" ]] && steam_root="${root%/steamapps}" || steam_root="$root"
  vdf="$steam_root/steamapps/libraryfolders.vdf"
  [[ -f "$vdf" ]] || continue
  while IFS= read -r library; do
    library="${library//\\\\/\\}"
    add_steamapps "$library"
  done < <(sed -nE 's/^[[:space:]]*"path"[[:space:]]*"([^"]+)".*/\1/p' "$vdf")
done

for steamapps in "${steamapps_dirs[@]:-}"; do
  manifest="$steamapps/appmanifest_838350.acf"
  game="$steamapps/common/The Scroll Of Taiwu"
  if [[ -f "$manifest" && -f "$game/Backend/GameData.Shared.dll" ]]; then
    (cd -- "$game" && pwd -P)
    exit 0
  fi
done

exit 1
