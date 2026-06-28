#!/usr/bin/env bash
# 校验 git tag 版本与 app/src-tauri/tauri.conf.json 中的 version 一致
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAURI_CONF="$ROOT/app/src-tauri/tauri.conf.json"

TAG="${GITHUB_REF_NAME:-}"
if [[ -z "$TAG" ]]; then
  echo "GITHUB_REF_NAME is not set" >&2
  exit 1
fi

if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$ ]]; then
  echo "Unsupported tag format: $TAG (expected v1.2.3)" >&2
  exit 1
fi

TAG_VERSION="${TAG#v}"
APP_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$TAURI_CONF" | head -1)"

if [[ -z "$APP_VERSION" ]]; then
  echo "Failed to read version from $TAURI_CONF" >&2
  exit 1
fi

if [[ "$TAG_VERSION" != "$APP_VERSION" ]]; then
  echo "Version mismatch: tag $TAG ($TAG_VERSION) != tauri.conf.json ($APP_VERSION)" >&2
  echo "Run: bash scripts/bump-version.sh $TAG_VERSION" >&2
  exit 1
fi

echo "Version OK: $TAG_VERSION"
