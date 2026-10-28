#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
export PATH="$PROJECT_DIR/.runtime/node_modules/.bin:$PATH"
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)' 2>/dev/null; then
  npm install --prefix "$PROJECT_DIR/.runtime" --no-save --package-lock=false node@22
  hash -r
fi
# Stop on a failed initial sync so stale records cannot overwrite another computer's work.
if ! ./sync-progress.sh --pull; then
  echo "진행도 동기화 실패. 인터넷/GitHub 로그인 또는 Git 충돌을 확인한 뒤 다시 실행하세요." >&2
  exit 1
fi
cd "$PROJECT_DIR/site"
lock_hash=$(git hash-object package-lock.json)
if [[ ! -f node_modules/.roadmap-lock-hash ]] || [[ "$(cat node_modules/.roadmap-lock-hash)" != "$lock_hash" ]]; then
  npm ci
  printf '%s\n' "$lock_hash" > node_modules/.roadmap-lock-hash
fi
server_pid=
sync_pid=
cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$sync_pid" ]]; then kill "$sync_pid" 2>/dev/null || true; wait "$sync_pid" 2>/dev/null || true; fi
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  "$PROJECT_DIR/sync-progress.sh" || echo "업로드 실패: 기록은 로컬에 보관됩니다. ./sync-progress.sh 로 재시도하세요." >&2
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
(
  while sleep 15; do
    "$PROJECT_DIR/sync-progress.sh" || echo "진행도 업로드 실패. 15초 후 재시도합니다." >&2
  done
) &
sync_pid=$!
echo "진행도 자동 동기화 켜짐: 15초 간격 및 종료 시 GitHub에 저장합니다."
./node_modules/.bin/vite "$@" &
server_pid=$!
wait "$server_pid"
