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

ORBIT_PLUGINS_DIR="$ROOT/orbit-plugins"
ORBIT_PLUGINS_DIST="$ORBIT_PLUGINS_DIR/dist"
if [ -f "$ORBIT_PLUGINS_DIR/Makefile" ]; then
  echo "building official wasm plugins..."
  (cd "$ORBIT_PLUGINS_DIR" && make package-all)
fi

PLUGINS_DST="$OUT_DIR/plugins"
if [ -d "$ORBIT_PLUGINS_DIST" ] && [ -n "$(ls -A "$ORBIT_PLUGINS_DIST" 2>/dev/null)" ]; then
  rm -rf "$PLUGINS_DST"
  mkdir -p "$PLUGINS_DST"
  for plugin_dir in "$ORBIT_PLUGINS_DIST"/*/; do
    [ -d "$plugin_dir" ] || continue
    id="$(basename "$plugin_dir")"
    cp -R "$plugin_dir" "$PLUGINS_DST/$id"
  done
  echo "bundled plugins from dist -> $PLUGINS_DST"
elif [ -d "$ROOT/plugins" ]; then
  rm -rf "$PLUGINS_DST"
  cp -R "$ROOT/plugins" "$PLUGINS_DST"
  echo "bundled plugins from repo plugins/ -> $PLUGINS_DST"
fi

echo "built $OUT_DIR/orbit-runtime-$SUFFIX"

ENTITLEMENTS="$ROOT/app/src-tauri/entitlements.plist"
if [[ -f "$ENTITLEMENTS" ]]; then
  codesign --force --sign - --options runtime \
    --entitlements "$ENTITLEMENTS" \
    "$OUT_DIR/orbit-runtime-$SUFFIX"
  echo "signed orbit-runtime with JIT entitlements"
fi
