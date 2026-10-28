#!/usr/bin/env bash
# Commit only quiz records; never stage lesson or application changes.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export GIT_TERMINAL_PROMPT=0
branch=$(git symbolic-ref --quiet --short HEAD)
if [[ -z "$(git config user.name || true)" ]]; then
  git config user.name wandubean
fi
if [[ -z "$(git config user.email || true)" ]]; then
  git config user.email wandubean@users.noreply.github.com
fi
files=()
if [[ -d progress ]]; then
  while IFS= read -r -d '' file; do files+=("$file"); done < <(find progress -maxdepth 1 -type f -name '*.json' -print0)
fi
if (( ${#files[@]} )); then
  node -e 'for (const file of process.argv.slice(1)) JSON.parse(require("node:fs").readFileSync(file, "utf8"))' "${files[@]}"
  git add -- "${files[@]}"
  if ! git diff --cached --quiet -- "${files[@]}"; then
    git commit --only -m "Record quiz progress" -- "${files[@]}"
  fi
fi
if [[ "${1:-}" == --pull ]]; then
  git pull --ff-only origin "$branch"
fi
# Retry earlier offline commits even when there are no new answers.
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$branch")" ]]; then
  git push origin "HEAD:refs/heads/$branch"
fi
