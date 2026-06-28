#!/usr/bin/env bash
# 一键同步更新应用版本号
#
# 用法:
#   bash scripts/bump-version.sh 1.2.0
#   make bump-version   # 版本号写在 Makefile 中
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/build-common.sh"

NEW_VERSION="${1:-}"
if [[ -z "$NEW_VERSION" ]]; then
  die "用法: bump-version.sh <version>  例如: bump-version.sh 1.2.0"
fi

if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$ ]]; then
  die "版本号格式无效: $NEW_VERSION（期望 semver，如 1.2.0 或 1.2.0-beta.1）"
fi

OLD_VERSION="$(app_version)"
info "更新应用版本: ${OLD_VERSION:-?} -> $NEW_VERSION"

# package.json + package-lock.json
(
  cd "$APP_DIR"
  npm version --no-git-tag-version "$NEW_VERSION" --allow-same-version >/dev/null
)
ok "app/package.json"
ok "app/package-lock.json"

# tauri.conf.json
node - "$TAURI_DIR/tauri.conf.json" "$NEW_VERSION" <<'NODE'
const fs = require("fs");
const [path, version] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(path, "utf8"));
data.version = version;
fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
NODE
ok "app/src-tauri/tauri.conf.json"

# Cargo.toml（[package] 段内的 version）
awk -v ver="$NEW_VERSION" '
  /^\[package\]/ { in_pkg = 1 }
  in_pkg && /^version = / {
    $0 = "version = \"" ver "\""
    in_pkg = 0
  }
  { print }
' "$TAURI_DIR/Cargo.toml" > "$TAURI_DIR/Cargo.toml.tmp"
mv "$TAURI_DIR/Cargo.toml.tmp" "$TAURI_DIR/Cargo.toml"
ok "app/src-tauri/Cargo.toml"

# Cargo.lock（仅 orbit-reader 包）
if [[ -f "$TAURI_DIR/Cargo.lock" ]]; then
  awk -v ver="$NEW_VERSION" '
    /^name = "orbit-reader"$/ { found = 1 }
    found && /^version = / {
      $0 = "version = \"" ver "\""
      found = 0
    }
    { print }
  ' "$TAURI_DIR/Cargo.lock" > "$TAURI_DIR/Cargo.lock.tmp"
  mv "$TAURI_DIR/Cargo.lock.tmp" "$TAURI_DIR/Cargo.lock"
  ok "app/src-tauri/Cargo.lock"
fi

echo ""
ok "版本号已统一为 $NEW_VERSION"
