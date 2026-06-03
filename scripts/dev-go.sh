#!/usr/bin/env bash
# 开发用：直接 go run，改 Go 代码后 Ctrl+C 再启动即可，无需 build sidecar。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${ORBIT_PORT:-17890}"

export ORBIT_PORT="$PORT"
# dist/ first: dev builds in orbit-plugins/dist override packaged plugins/
export ORBIT_PLUGINS_DIR="$ROOT/orbit-plugins/dist:$ROOT/plugins"
export ORBIT_DEV_AUTO_INSTALL=1

echo "Starting Go runtime (dev) on http://127.0.0.1:${PORT}"
echo "  ORBIT_PLUGINS_DIR=$ORBIT_PLUGINS_DIR"
echo "  ORBIT_DEV_AUTO_INSTALL=1 (official bundled plugins auto-register)"
echo "In another terminal:"
echo "  cd app && ORBIT_RUNTIME_URL=http://127.0.0.1:${PORT} npm run tauri dev"
echo ""

cd "$ROOT/runtime"
exec go run ./cmd/orbit-runtime
