#!/usr/bin/env bash
# 将各平台 artifact 重命名为统一的 Release 资产名
set -euo pipefail

VERSION="${GITHUB_REF_NAME#v}"
DIST_DIR="${1:-dist}"
OUT_DIR="${2:-release}"

mkdir -p "$OUT_DIR"

copy_one() {
  local src="$1"
  local dst="$2"
  if [[ -f "$src" ]]; then
    cp "$src" "$OUT_DIR/$dst"
    echo "  $dst"
  fi
}

find_file() {
  local pattern="$1"
  find "$DIST_DIR" -type f -name "$pattern" 2>/dev/null | head -1
}

# macOS DMG（arm64 在 target/release，x64 在 target/x86_64-apple-darwin/release）
ARM_DMG="$(find_file 'orbit_*_aarch64.dmg')"
X64_DMG="$(find_file 'orbit_*_x86_64.dmg')"
copy_one "$ARM_DMG" "orbit-${VERSION}-macos-aarch64.dmg"
copy_one "$X64_DMG" "orbit-${VERSION}-macos-x86_64.dmg"

# Windows
MSI="$(find_file '*.msi')"
NSIS="$(find_file '*-setup.exe')"
if [[ -z "$NSIS" ]]; then
  NSIS="$(find_file '*.exe')"
fi
copy_one "$MSI" "orbit-${VERSION}-windows-x64.msi"
copy_one "$NSIS" "orbit-${VERSION}-windows-x64-setup.exe"

# Linux
DEB="$(find_file '*.deb')"
APPIMAGE="$(find_file '*.AppImage')"
copy_one "$DEB" "orbit-${VERSION}-linux-amd64.deb"
copy_one "$APPIMAGE" "orbit-${VERSION}-linux-amd64.AppImage"

echo ""
echo "Release assets in $OUT_DIR:"
ls -lh "$OUT_DIR"

missing=0
for f in \
  "orbit-${VERSION}-macos-aarch64.dmg" \
  "orbit-${VERSION}-macos-x86_64.dmg" \
  "orbit-${VERSION}-windows-x64.msi" \
  "orbit-${VERSION}-windows-x64-setup.exe" \
  "orbit-${VERSION}-linux-amd64.deb" \
  "orbit-${VERSION}-linux-amd64.AppImage"
do
  if [[ ! -f "$OUT_DIR/$f" ]]; then
    echo "Missing: $f" >&2
    missing=1
  fi
done

if [[ $missing -ne 0 ]]; then
  exit 1
fi
