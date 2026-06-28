#!/usr/bin/env bash
# 构建并签名 macOS 应用（.app + .dmg）
#
# 用法:
#   bash scripts/build-macos-app.sh              # 默认本机架构 .app + DMG
#   MACOS_ARCH=x86_64 bash scripts/build-macos-app.sh  # 在 M 系列 Mac 上打 Intel 包
#   BUNDLES=app bash scripts/build-macos-app.sh  # 仅 .app，不生成 DMG
#   SKIP_ICONS=1 bash scripts/build-macos-app.sh # 跳过图标重新生成
#
# 签名配置: 复制 scripts/signing.env.example -> scripts/signing.env
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/build-common.sh"

LOGO="${LOGO:-$ROOT/app/src/assets/logo.png}"
BUNDLES="${BUNDLES:-dmg,app}"
SKIP_ICONS="${SKIP_ICONS:-0}"
VITE_ORBIT_ENABLE_FULL_EXPERIENCE="${VITE_ORBIT_ENABLE_FULL_EXPERIENCE:-0}"

# ── 加载签名配置 ─────────────────────────────────────────────────────
if [[ -f "$SCRIPT_DIR/signing.env" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/signing.env"
  ok "已加载 scripts/signing.env"
else
  warn "未找到 scripts/signing.env"
  warn "请复制 scripts/signing.env.example 并填入签名信息："
  warn "  cp scripts/signing.env.example scripts/signing.env"
  echo ""
fi

# ── 前置检查 ─────────────────────────────────────────────────────────
[[ "$(uname -s)" == "Darwin" ]] || die "此脚本仅支持 macOS"

ensure_app_deps
command -v magick >/dev/null || die "未找到 magick (ImageMagick)，请先安装: brew install imagemagick"

resolve_macos_arch() {
  local arch="${MACOS_ARCH:-$(uname -m)}"
  case "$arch" in
    arm64|aarch64) echo "arm64" ;;
    x86_64|x64|amd64) echo "x86_64" ;;
    *) die "不支持的 MACOS_ARCH: $arch（可用 arm64 / x86_64）" ;;
  esac
}

macos_runtime_target() {
  case "$(resolve_macos_arch)" in
    arm64)  echo "macos-arm64" ;;
    x86_64) echo "macos-x64" ;;
  esac
}

tauri_rust_target() {
  case "$(resolve_macos_arch)" in
    arm64)  echo "aarch64-apple-darwin" ;;
    x86_64) echo "x86_64-apple-darwin" ;;
  esac
}

arch_tag() {
  case "$(resolve_macos_arch)" in
    arm64)  echo "aarch64" ;;
    x86_64) echo "x86_64" ;;
  esac
}

# ── 签名身份检查 ─────────────────────────────────────────────────────
if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  AUTO_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
    | grep 'Developer ID Application' \
    | head -1 \
    | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]+"(.+)"[[:space:]]+.*/\1/' || true)"
  if [[ -n "$AUTO_IDENTITY" ]]; then
    export APPLE_SIGNING_IDENTITY="$AUTO_IDENTITY"
    ok "自动选用签名证书: $APPLE_SIGNING_IDENTITY"
  else
    warn "未设置 APPLE_SIGNING_IDENTITY，将使用临时签名 (ad-hoc)"
    warn "临时签名无法公证，其他设备可能无法直接打开"
    export APPLE_SIGNING_IDENTITY="-"
  fi
elif [[ "$APPLE_SIGNING_IDENTITY" != "-" ]]; then
  if ! security find-identity -v -p codesigning 2>/dev/null | grep -Fq "$APPLE_SIGNING_IDENTITY"; then
    die "钥匙串中未找到证书: $APPLE_SIGNING_IDENTITY"
  fi
  ok "签名证书: $APPLE_SIGNING_IDENTITY"
else
  warn "使用临时签名 (ad-hoc)"
fi

NOTARIZE=0
if [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  NOTARIZE=1
elif [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_ISSUER:-}" && -n "${APPLE_API_KEY_PATH:-}" ]]; then
  NOTARIZE=1
fi
if [[ $NOTARIZE -eq 1 && "$APPLE_SIGNING_IDENTITY" != "-" ]]; then
  ok "检测到公证凭据，构建完成后将自动提交公证"
fi

# ── 1. 生成应用图标 ──────────────────────────────────────────────────
if [[ "$SKIP_ICONS" != "1" ]]; then
  [[ -f "$LOGO" ]] || die "Logo 不存在: $LOGO"
  info "从 $LOGO 生成应用图标..."
  bash "$SCRIPT_DIR/prepare-app-icon.sh" "$LOGO" "$TAURI_DIR/app-icon.png"
  (cd "$APP_DIR" && npx tauri icon src-tauri/app-icon.png -o src-tauri/icons)
  ok "应用图标已更新"
else
  info "跳过图标生成 (SKIP_ICONS=1)"
fi

# ── 2. 编译 Go sidecar ───────────────────────────────────────────────
RUNTIME_TARGET="$(macos_runtime_target)"
RUST_TARGET="$(tauri_rust_target)"
HOST_ARCH="$(uname -m)"

info "目标架构: $RUNTIME_TARGET (Rust: $RUST_TARGET)"
bash "$SCRIPT_DIR/build-runtime.sh" "$RUNTIME_TARGET"

if [[ "$(resolve_macos_arch)" != "$HOST_ARCH" && "$HOST_ARCH" == "arm64" ]]; then
  if ! rustup target list --installed 2>/dev/null | grep -q "^${RUST_TARGET}$"; then
    info "安装 Rust 交叉编译目标: $RUST_TARGET"
    rustup target add "$RUST_TARGET"
  fi
fi

# ── 3. Tauri 打包（先只打 .app，sidecar 补签后再生成 DMG）────────────
WANT_DMG=0
[[ "$BUNDLES" == *"dmg"* ]] && WANT_DMG=1

info "Tauri 打包 (.app)..."
(
  cd "$APP_DIR"
  export SKIP_RUNTIME_BUILD=1
  export VITE_ORBIT_ENABLE_FULL_EXPERIENCE
  export APPLE_SIGNING_IDENTITY
  [[ -n "${APPLE_PROVIDER_SHORT_NAME:-}" ]] && export APPLE_PROVIDER_SHORT_NAME
  [[ -n "${APPLE_ID:-}" ]]              && export APPLE_ID
  [[ -n "${APPLE_PASSWORD:-}" ]]        && export APPLE_PASSWORD
  [[ -n "${APPLE_TEAM_ID:-}" ]]         && export APPLE_TEAM_ID
  [[ -n "${APPLE_API_ISSUER:-}" ]]      && export APPLE_API_ISSUER
  [[ -n "${APPLE_API_KEY:-}" ]]         && export APPLE_API_KEY
  [[ -n "${APPLE_API_KEY_PATH:-}" ]]    && export APPLE_API_KEY_PATH

  if [[ "$(resolve_macos_arch)" == "$HOST_ARCH" ]]; then
    npm run tauri build -- --bundles app
  else
    npm run tauri build -- --target "$RUST_TARGET" --bundles app
  fi
)

# ── 4. sidecar JIT 补签 + 重签 .app（WASM / wazero 必需）──────────────
BUNDLE_DIR="$TAURI_DIR/target"
if [[ "$(resolve_macos_arch)" != "$HOST_ARCH" ]]; then
  BUNDLE_DIR="$BUNDLE_DIR/$RUST_TARGET/release/bundle"
else
  BUNDLE_DIR="$BUNDLE_DIR/release/bundle"
fi

APP_BUNDLE="$BUNDLE_DIR/macos/orbit.app"
MACOS_DIR="$APP_BUNDLE/Contents/MacOS"
ENTITLEMENTS="$TAURI_DIR/entitlements.plist"
RUNTIME_BIN="$MACOS_DIR/orbit-runtime"
SIGN_ID="${APPLE_SIGNING_IDENTITY:--}"

sign_macos_sidecar_and_app() {
  [[ -f "$ENTITLEMENTS" ]] || die "缺少 JIT entitlements: $ENTITLEMENTS"
  [[ -f "$RUNTIME_BIN" ]] || die "未找到 sidecar: $RUNTIME_BIN"

  info "为 orbit-runtime sidecar 附加 JIT entitlements 并签名..."
  codesign --force --sign "$SIGN_ID" --options runtime \
    --entitlements "$ENTITLEMENTS" "$RUNTIME_BIN"

  if ! codesign -d --entitlements - "$RUNTIME_BIN" 2>&1 | grep -q "com.apple.security.cs.allow-jit"; then
    die "sidecar 签名后未检测到 allow-jit entitlement"
  fi
  ok "orbit-runtime 已签名（allow-jit）"

  info "重新签名应用包 orbit.app（包含已更新的 sidecar）..."
  codesign --force --deep --sign "$SIGN_ID" --options runtime \
    --entitlements "$ENTITLEMENTS" "$APP_BUNDLE"
  codesign --verify --deep --strict "$APP_BUNDLE"
  ok "orbit.app 已重新签名"
}

sign_macos_sidecar_and_app

# ── 5. 根据已签名的 .app 生成 DMG ────────────────────────────────────
recreate_dmg() {
  local dmg_dir="$BUNDLE_DIR/dmg"
  local version dmg_path
  version="$(app_version)"
  dmg_path="$dmg_dir/orbit_${version}_$(arch_tag).dmg"

  mkdir -p "$dmg_dir"
  rm -f "$dmg_path"
  info "根据已签名 .app 生成 DMG..."
  hdiutil create -volname "orbit" -srcfolder "$APP_BUNDLE" -ov -format UDZO "$dmg_path" >/dev/null
  if [[ "$SIGN_ID" != "-" ]]; then
    codesign --force --sign "$SIGN_ID" "$dmg_path" 2>/dev/null || true
  fi
  ok "DMG 已生成: $dmg_path"
}

if [[ $WANT_DMG -eq 1 ]]; then
  recreate_dmg
fi

# ── 6. 输出产物路径 ──────────────────────────────────────────────────
echo ""
ok "构建完成！产物目录:"
echo ""
if [[ -d "$MACOS_DIR" ]]; then
  echo "  $APP_BUNDLE"
  ls -lh "$BUNDLE_DIR/dmg/"*.dmg 2>/dev/null | awk '{print "  "$9" ("$5")"}' || true
fi
