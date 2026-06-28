#!/usr/bin/env bash
# 构建 Linux 应用（.deb / .AppImage 等）
#
# 用法:
#   bash scripts/build-linux-app.sh
#   LINUX_ARCH=arm64 bash scripts/build-linux-app.sh  # ARM64 Linux
#   BUNDLES=deb bash scripts/build-linux-app.sh       # 仅 deb 包
#
# 说明:
#   - 须在 Linux 上运行
#   - 需安装 Tauri Linux 依赖（webkit2gtk 等）
#   - 参见 https://v2.tauri.app/start/prerequisites/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/build-common.sh"

BUNDLES="${BUNDLES:-deb,appimage}"

[[ "$(uname -s)" == "Linux" ]] || die "此脚本须在 Linux 上运行（Tauri 无法在 macOS/Windows 上打包 Linux 应用）"

ensure_app_deps

resolve_linux_target() {
  local arch="${LINUX_ARCH:-$(uname -m)}"
  case "$arch" in
    x86_64|amd64) echo "linux" ;;
    aarch64|arm64) echo "linux-arm64" ;;
    *) die "不支持的 LINUX_ARCH: ${arch} (可用 x86_64 / arm64)" ;;
  esac
}

RUNTIME_TARGET="$(resolve_linux_target)"
RUST_TARGET=""
case "$RUNTIME_TARGET" in
  linux)       RUST_TARGET="" ;;
  linux-arm64)
    RUST_TARGET="aarch64-unknown-linux-gnu"
    if ! rustup target list --installed 2>/dev/null | grep -q "^${RUST_TARGET}$"; then
      info "安装 Rust 交叉编译目标: $RUST_TARGET"
      rustup target add "$RUST_TARGET"
    fi
    ;;
esac

info "编译 Linux runtime sidecar ($RUNTIME_TARGET)..."
bash "$SCRIPT_DIR/build-runtime.sh" "$RUNTIME_TARGET"

info "Tauri 打包 Linux 应用 (bundles: $BUNDLES)..."
if [[ -n "$RUST_TARGET" ]]; then
  run_tauri_build --target "$RUST_TARGET" --bundles "$BUNDLES"
else
  run_tauri_build --bundles "$BUNDLES"
fi

echo ""
ok "构建完成！产物:"
print_bundle_outputs
