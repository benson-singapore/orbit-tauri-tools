#!/usr/bin/env bash
# 构建 Windows 应用（.msi / .exe 安装包）
#
# 用法:
#   bash scripts/build-windows-app.sh
#   BUNDLES=msi bash scripts/build-windows-app.sh   # 仅 MSI
#   BUNDLES=nsis bash scripts/build-windows-app.sh  # 仅 NSIS 安装器
#
# 说明:
#   - 须在 Windows（或 MSYS2 / Git Bash）上运行
#   - runtime 可用 Zig 交叉编译；也可在本机直接编译
#   - 需安装 WebView2、Visual Studio Build Tools（Rust MSVC 工具链）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/build-common.sh"

BUNDLES="${BUNDLES:-msi,nsis}"

is_windows_host() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*|Windows_NT) return 0 ;;
  esac
  [[ "${OS:-}" == "Windows_NT" ]]
}

[[ "$(is_windows_host && echo yes || echo no)" == "yes" ]] \
  || die "此脚本须在 Windows 上运行（Tauri 无法在 macOS/Linux 上打包 Windows 应用）"

ensure_app_deps

info "编译 Windows runtime sidecar..."
bash "$SCRIPT_DIR/build-runtime.sh" windows

info "Tauri 打包 Windows 应用 (bundles: $BUNDLES)..."
run_tauri_build --bundles "$BUNDLES"

echo ""
ok "构建完成！产物:"
print_bundle_outputs
