#!/usr/bin/env bash
# macOS app icon: safe-area padding + squircle corners on the artwork (not full bleed).
set -euo pipefail

INPUT="${1:?usage: prepare-app-icon.sh <input.png> <output.png> [size]}"
OUTPUT="${2:?usage: prepare-app-icon.sh <input.png> <output.png> [size]}"
SIZE="${3:-1024}"
# Safe-area scale so Dock size matches other apps (~82%).
CONTENT_SCALE="${CONTENT_SCALE:-0.82}"
CONTENT=$(python3 -c "print(int($SIZE * $CONTENT_SCALE))")
# Corner radius on the artwork box (~22.37% of its size, Apple squircle approximation).
RADIUS=$(python3 -c "print(int($CONTENT * 0.2237))")

mkdir -p "$(dirname "$OUTPUT")"
TMP="$(mktemp "${TMPDIR:-/tmp}/app-icon-XXXXXX.png")"
trap 'rm -f "$TMP"' EXIT

# Two steps: DstIn + extent must not run in one magick chain (ImageMagick bug/quirk).
magick "$INPUT" -resize "${CONTENT}x${CONTENT}" -alpha on \
  \( -size "${CONTENT}x${CONTENT}" xc:none \
     -fill white -draw "roundrectangle 0,0 $((CONTENT-1)),$((CONTENT-1)) $RADIUS,$RADIUS" \) \
  -compose DstIn -composite \
  PNG32:"$TMP"

magick "$TMP" -background none -gravity center -extent "${SIZE}x${SIZE}" \
  PNG32:"$OUTPUT"

echo "Wrote $OUTPUT (${SIZE}x${SIZE}, artwork ${CONTENT}px, radius ${RADIUS}px)"
