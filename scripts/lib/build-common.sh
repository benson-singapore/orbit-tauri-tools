#!/usr/bin/env bash
# 构建脚本公共函数（由其他 scripts/*.sh source）

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$ROOT/app"
TAURI_DIR="$APP_DIR/src-tauri"
RUNTIME_DIR="$ROOT/runtime"
BINARIES_DIR="$TAURI_DIR/binaries"
PLUGINS_DST="$BINARIES_DIR/plugins"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}▸${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
die()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

ensure_app_deps() {
  command -v node  >/dev/null || die "未找到 node，请先安装 Node.js 18+"
  command -v cargo >/dev/null || die "未找到 cargo，请先安装 Rust"
  command -v go    >/dev/null || die "未找到 go，请先安装 Go 1.22+"
  if [[ ! -d "$APP_DIR/node_modules" ]]; then
    info "安装前端依赖..."
    (cd "$APP_DIR" && npm install)
  fi
}

app_version() {
  local version
  version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    "$TAURI_DIR/tauri.conf.json" | head -1)"
  [[ -n "$version" ]] || version="0.0.0"
  echo "$version"
}

bundle_plugins() {
  local orbit_plugins_dir="$ROOT/orbit-plugins"
  local orbit_plugins_dist="$orbit_plugins_dir/dist"

  if [[ -f "$orbit_plugins_dir/Makefile" ]]; then
    info "编译官方 WASM 插件..."
    (cd "$orbit_plugins_dir" && make package-all)
  fi

  if [[ -d "$orbit_plugins_dist" && -n "$(ls -A "$orbit_plugins_dist" 2>/dev/null)" ]]; then
    rm -rf "$PLUGINS_DST"
    mkdir -p "$PLUGINS_DST"
    for plugin_dir in "$orbit_plugins_dist"/*/; do
      [[ -d "$plugin_dir" ]] || continue
      local id
      id="$(basename "$plugin_dir")"
      cp -R "$plugin_dir" "$PLUGINS_DST/$id"
    done
    ok "已打包插件 (orbit-plugins/dist) -> $PLUGINS_DST"
  elif [[ -d "$ROOT/plugins" ]]; then
    rm -rf "$PLUGINS_DST"
    cp -R "$ROOT/plugins" "$PLUGINS_DST"
    ok "已打包插件 (plugins/) -> $PLUGINS_DST"
  fi
}

sign_macos_runtime_binary() {
  local binary="$1"
  local entitlements="$TAURI_DIR/entitlements.plist"
  [[ -f "$binary" ]] || return 0
  [[ -f "$entitlements" ]] || return 0
  codesign --force --sign - --options runtime \
    --entitlements "$entitlements" \
    "$binary" 2>/dev/null || true
}

run_tauri_build() {
  local -a extra_args=("$@")
  (
    cd "$APP_DIR"
    export SKIP_RUNTIME_BUILD=1
    npm run tauri build -- "${extra_args[@]}"
  )
}

print_bundle_outputs() {
  local bundle_dir="$TAURI_DIR/target/release/bundle"
  if [[ -d "$bundle_dir" ]]; then
    find "$bundle_dir" -type f \( \
      -name "*.dmg" -o -name "*.app" -o -name "*.msi" -o -name "*.exe" \
      -o -name "*.deb" -o -name "*.AppImage" -o -name "*.rpm" \
    \) 2>/dev/null | sort | while read -r f; do
      echo "  $f ($(du -h "$f" | awk '{print $1}'))"
    done
  fi
}
