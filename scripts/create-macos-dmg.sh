#!/usr/bin/env bash
# 创建 macOS 安装 DMG：orbit.app + Applications + 安装说明 + 背景图
#
# 用法:
#   bash scripts/create-macos-dmg.sh /path/to/orbit.app /path/to/output.dmg [卷名] [sign_identity]
#
# 环境变量:
#   DMG_DEBUG=1  输出详细错误，不静默回退
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESOURCES_DIR="$SCRIPT_DIR/dmg-resources"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/build-common.sh"

APP_BUNDLE="${1:-}"
OUTPUT_DMG="${2:-}"
VOLUME_NAME="${3:-orbit}"
SIGN_ID="${4:--}"

INSTRUCTIONS_SRC="$RESOURCES_DIR/安装说明.txt"
BACKGROUND_FILE="$RESOURCES_DIR/dmg-background.png"
INSTRUCTIONS_NAME="INSTALL.txt"
GUIDE_IMAGE_NAME="GUIDE.png"

[[ -d "$APP_BUNDLE" ]] || die "应用包不存在: $APP_BUNDLE"
[[ -n "$OUTPUT_DMG" ]] || die "用法: create-macos-dmg.sh <app_bundle> <output.dmg> [volume_name] [sign_identity]"
[[ -f "$INSTRUCTIONS_SRC" ]] || die "缺少安装说明: $INSTRUCTIONS_SRC"
[[ -f "$BACKGROUND_FILE" ]] || die "缺少 DMG 背景图: $BACKGROUND_FILE"

APP_NAME="$(basename "$APP_BUNDLE")"
OUTPUT_DIR="$(dirname "$OUTPUT_DMG")"
mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DMG"

export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

parse_mount_dir() {
  local attach_line mount_dir
  attach_line="$(hdiutil attach -readwrite -noverify -noautoopen "$1" | grep -E '/Volumes/' | tail -1 || true)"
  [[ -n "$attach_line" ]] || return 1
  mount_dir="$(printf '%s' "$attach_line" | awk -F'\t' '{print $NF}' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -n "$mount_dir" && -d "$mount_dir" ]] || return 1
  printf '%s' "$mount_dir"
}

stage_common_files() {
  local dest="$1"
  ditto "$APP_BUNDLE" "$dest/$APP_NAME"
  ln -s /Applications "$dest/Applications"
  cp "$INSTRUCTIONS_SRC" "$dest/$INSTRUCTIONS_NAME"
  cp "$BACKGROUND_FILE" "$dest/$GUIDE_IMAGE_NAME"
}

hide_background_dir() {
  local mount_dir="$1"
  if command -v SetFile >/dev/null 2>&1; then
    SetFile -a V "$mount_dir/.background" 2>/dev/null || true
  else
    chflags hidden "$mount_dir/.background" 2>/dev/null || true
  fi
}

apply_finder_layout() {
  local mount_dir="$1"
  local vol_name="$2"
  local bg_posix="$mount_dir/.background/dmg-background.png"

  [[ -f "$bg_posix" ]] || die "背景图不存在: $bg_posix"

  osascript <<EOF
tell application "Finder"
  tell disk "$vol_name"
    open
    set theWindow to container window
    set current view of theWindow to icon view
    set toolbar visible of theWindow to false
    set statusbar visible of theWindow to false
    set the bounds of theWindow to {100, 100, 680, 440}
    set viewOptions to the icon view options of theWindow
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to 128
    set background picture of viewOptions to POSIX file "$bg_posix"
    set position of item "$APP_NAME" of theWindow to {150, 210}
    set position of item "Applications" of theWindow to {470, 210}
    set position of item "$INSTRUCTIONS_NAME" of theWindow to {120, 360}
    set position of item "$GUIDE_IMAGE_NAME" of theWindow to {430, 360}
    update without registering applications
    delay 2
  end tell
end tell
EOF
}

create_simple_dmg() {
  local staging
  staging="$(mktemp -d)"
  trap 'rm -rf "$staging"' RETURN

  stage_common_files "$staging"

  info "生成 DMG (含 Applications、$INSTRUCTIONS_NAME 与 $GUIDE_IMAGE_NAME)..."
  hdiutil create -volname "$VOLUME_NAME" -srcfolder "$staging" -ov -format UDZO "$OUTPUT_DMG" >/dev/null
}

create_styled_dmg() {
  local staging rw_dmg mount_dir vol_name size_mb
  staging="$(mktemp -d)"
  rw_dmg="$(mktemp -t orbit-dmg).dmg"

  stage_common_files "$staging"

  size_mb=$(( $(du -sm "$staging" | cut -f1) + 80 ))
  hdiutil create -size "${size_mb}m" -fs HFS+ -volname "$VOLUME_NAME" -ov "$rw_dmg" >/dev/null

  mount_dir="$(parse_mount_dir "$rw_dmg")" || return 1
  vol_name="$(basename "$mount_dir")"

  ditto "$staging/$APP_NAME" "$mount_dir/$APP_NAME"
  ln -sf /Applications "$mount_dir/Applications"
  cp "$staging/$INSTRUCTIONS_NAME" "$mount_dir/$INSTRUCTIONS_NAME"
  cp "$staging/$GUIDE_IMAGE_NAME" "$mount_dir/$GUIDE_IMAGE_NAME"

  mkdir -p "$mount_dir/.background"
  cp "$BACKGROUND_FILE" "$mount_dir/.background/dmg-background.png"
  hide_background_dir "$mount_dir"

  apply_finder_layout "$mount_dir" "$vol_name"

  sync
  sleep 2
  hdiutil detach "$mount_dir" >/dev/null
  hdiutil convert "$rw_dmg" -format UDZO -o "$OUTPUT_DMG" >/dev/null
  rm -f "$rw_dmg"
  rm -rf "$staging"
}

styled_ok=0
styled_err=""
if [[ "$(uname -s)" == "Darwin" ]]; then
  if styled_err="$(create_styled_dmg 2>&1)"; then
    styled_ok=1
  elif [[ "${DMG_DEBUG:-0}" == "1" ]]; then
    die "DMG 窗口背景设置失败: ${styled_err}"
  fi
fi

if [[ $styled_ok -eq 1 ]]; then
  ok "DMG 已生成 (含窗口背景与安装说明): $OUTPUT_DMG"
else
  if [[ -n "$styled_err" ]]; then
    warn "DMG 窗口背景设置失败，回退标准布局"
    warn "详情: $(printf '%s' "$styled_err" | tr '\n' ' ')"
  fi
  create_simple_dmg
  ok "DMG 已生成 (含 $GUIDE_IMAGE_NAME 与 $INSTRUCTIONS_NAME): $OUTPUT_DMG"
fi

if [[ "$SIGN_ID" != "-" ]]; then
  codesign --force --sign "$SIGN_ID" "$OUTPUT_DMG" 2>/dev/null || true
fi
