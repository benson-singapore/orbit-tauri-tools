#!/usr/bin/env bash
# 交叉编译 Go runtime sidecar（优先 Zig，纯 Go 时回退到 go 内置交叉编译）
#
# 用法:
#   bash scripts/build-runtime.sh                    # 当前主机平台
#   bash scripts/build-runtime.sh all                # 全部支持的平台
#   bash scripts/build-runtime.sh macos-arm64        # 指定单个目标
#   bash scripts/build-runtime.sh macos-x64 windows linux linux-arm64
#
# 目标别名:
#   macos-arm64 | macos-x64 | windows | linux | linux-arm64
#
# 环境变量:
#   USE_ZIG=0        禁用 Zig，仅用 go 内置交叉编译
#   BUNDLE_PLUGINS=0 跳过插件打包
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/build-common.sh"

BUNDLE_PLUGINS="${BUNDLE_PLUGINS:-1}"
USE_ZIG="${USE_ZIG:-1}"

ALL_TARGETS="macos-arm64 macos-x64 windows linux linux-arm64"

target_goos() {
  case "$1" in
    macos-arm64|macos-x64) echo "darwin" ;;
    windows) echo "windows" ;;
    linux|linux-arm64) echo "linux" ;;
    *) die "未知目标: $1（可用: $ALL_TARGETS all）" ;;
  esac
}

target_goarch() {
  case "$1" in
    macos-arm64|linux-arm64) echo "arm64" ;;
    macos-x64|windows|linux) echo "amd64" ;;
    *) die "未知目标: $1" ;;
  esac
}

target_out() {
  case "$1" in
    macos-arm64) echo "orbit-runtime-aarch64-apple-darwin" ;;
    macos-x64)   echo "orbit-runtime-x86_64-apple-darwin" ;;
    windows)     echo "orbit-runtime-x86_64-pc-windows-msvc.exe" ;;
    linux)       echo "orbit-runtime-x86_64-unknown-linux-gnu" ;;
    linux-arm64) echo "orbit-runtime-aarch64-unknown-linux-gnu" ;;
    *) die "未知目标: $1" ;;
  esac
}

target_zig() {
  case "$1" in
    macos-arm64) echo "aarch64-macos" ;;
    macos-x64)   echo "x86_64-macos" ;;
    windows)     echo "x86_64-windows-gnu" ;;
    linux)       echo "x86_64-linux-gnu" ;;
    linux-arm64) echo "aarch64-linux-gnu" ;;
    *) die "未知目标: $1" ;;
  esac
}

host_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os-$arch" in
    Darwin-arm64)  echo "macos-arm64" ;;
    Darwin-x86_64) echo "macos-x64" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    Linux-x86_64)  echo "linux" ;;
    Linux-aarch64) echo "linux-arm64" ;;
    *) die "无法识别当前平台: $os $arch" ;;
  esac
}

is_cross_compile() {
  local name="$1"
  local host
  host="$(host_target)"
  [[ "$name" != "$host" ]]
}

have_zig() {
  [[ "$USE_ZIG" == "1" ]] && command -v zig >/dev/null 2>&1
}

build_one() {
  local name="$1"
  local goos goarch out_name zig_target out_file
  goos="$(target_goos "$name")"
  goarch="$(target_goarch "$name")"
  out_name="$(target_out "$name")"
  zig_target="$(target_zig "$name")"
  out_file="$BINARIES_DIR/$out_name"

  mkdir -p "$BINARIES_DIR"

  export CGO_ENABLED=0
  export GOOS="$goos"
  export GOARCH="$goarch"
  unset CC CXX 2>/dev/null || true

  if is_cross_compile "$name" && have_zig; then
    export CC="zig cc -target $zig_target"
    info "Zig 交叉编译 $name -> $out_name"
  elif is_cross_compile "$name"; then
    warn "未安装 zig，使用 go 内置交叉编译 $name（CGO_ENABLED=0）"
    info "交叉编译 $name -> $out_name"
  else
    info "本机编译 $name -> $out_name"
  fi

  (
    cd "$RUNTIME_DIR"
    go build -ldflags="-s -w" -o "$out_file" ./cmd/orbit-runtime
  )

  if [[ "$goos" == "darwin" ]]; then
    sign_macos_runtime_binary "$out_file"
  fi

  ok "已生成 $out_file"
}

resolve_targets() {
  if [[ $# -eq 0 ]]; then
    host_target
    return
  fi
  if [[ "$1" == "all" ]]; then
    echo "$ALL_TARGETS"
    return
  fi
  echo "$@"
}

main() {
  command -v go >/dev/null || die "未找到 go，请先安装 Go 1.22+"

  local -a targets
  # shellcheck disable=SC2206
  targets=($(resolve_targets "$@"))

  if [[ "$BUNDLE_PLUGINS" == "1" ]]; then
    bundle_plugins
  fi

  local t
  for t in "${targets[@]}"; do
    build_one "$t"
  done
}

main "$@"
