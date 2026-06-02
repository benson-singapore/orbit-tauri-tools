#!/usr/bin/env bash
# 单终端：后台启动 Go，就绪后启动 Tauri；Ctrl+C 会同时结束 Go 进程。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${ORBIT_PORT:-17890}"
export ORBIT_PORT="$PORT"
URL="http://127.0.0.1:${PORT}"

GO_PID=""

cleanup() {
  if [[ -n "$GO_PID" ]] && kill -0 "$GO_PID" 2>/dev/null; then
    echo ""
    echo "Stopping Go runtime (pid $GO_PID)..."
    kill "$GO_PID" 2>/dev/null || true
    wait "$GO_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting Go runtime on ${URL} ..."
cd "$ROOT/runtime"
go run ./cmd/orbit-runtime &
GO_PID=$!

echo "Waiting for /health ..."
ready=0
for _ in $(seq 1 50); do
  if curl -sf "${URL}/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.2
done

if [[ "$ready" -ne 1 ]]; then
  echo "Go runtime did not become ready at ${URL}" >&2
  exit 1
fi

echo "Starting Tauri (ORBIT_RUNTIME_URL=${URL}) ..."
cd "$ROOT/app"
export ORBIT_RUNTIME_URL="$URL"
exec npm run tauri:dev
