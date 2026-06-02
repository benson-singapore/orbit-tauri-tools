#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT/runtime"
OUT_DIR="$ROOT/app/src-tauri/binaries"

mkdir -p "$OUT_DIR"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) GOARCH=arm64; SUFFIX="aarch64-apple-darwin" ;;
  x86_64) GOARCH=amd64; SUFFIX="x86_64-apple-darwin" ;;
  *)
    echo "unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

export CGO_ENABLED=0
export GOOS=darwin
export GOARCH

cd "$RUNTIME_DIR"
go build -ldflags="-s -w" -o "$OUT_DIR/orbit-runtime-$SUFFIX" ./cmd/orbit-runtime

PLUGINS_SRC="$ROOT/plugins"
PLUGINS_DST="$OUT_DIR/plugins"
if [ -d "$PLUGINS_SRC" ]; then
  rm -rf "$PLUGINS_DST"
  cp -R "$PLUGINS_SRC" "$PLUGINS_DST"
  echo "bundled plugins -> $PLUGINS_DST"
fi

echo "built $OUT_DIR/orbit-runtime-$SUFFIX"
