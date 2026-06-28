#!/usr/bin/env bash
# 命令失败时自动重试（用于 CI 网络抖动）
set -euo pipefail

max="${RETRY_MAX:-3}"
delay="${RETRY_DELAY:-20}"
attempt=1

while true; do
  if "$@"; then
    exit 0
  fi
  exit_code=$?
  if [[ $attempt -ge $max ]]; then
    echo "Command failed after ${max} attempts: $*" >&2
    exit "$exit_code"
  fi
  echo "Attempt ${attempt}/${max} failed (exit ${exit_code}), retrying in ${delay}s: $*" >&2
  sleep "$delay"
  attempt=$((attempt + 1))
done
