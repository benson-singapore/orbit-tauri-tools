#!/usr/bin/env bash
# Tauri beforeBuildCommand 入口：支持跳过已预编译的 runtime
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${SKIP_RUNTIME_BUILD:-}" != "1" ]]; then
  bash "$ROOT/scripts/build-runtime.sh"
fi

cd "$ROOT/app"
npm run build
