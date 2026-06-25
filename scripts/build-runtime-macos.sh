#!/usr/bin/env bash
# 兼容旧脚本：编译当前 macOS 架构的 runtime sidecar
set -euo pipefail
exec "$(dirname "$0")/build-runtime.sh"
