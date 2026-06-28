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

if command -v magick >/dev/null 2>&1; then
  # Two steps: DstIn + extent must not run in one magick chain (ImageMagick bug/quirk).
  magick "$INPUT" -resize "${CONTENT}x${CONTENT}" -alpha on \
    \( -size "${CONTENT}x${CONTENT}" xc:none \
       -fill white -draw "roundrectangle 0,0 $((CONTENT-1)),$((CONTENT-1)) $RADIUS,$RADIUS" \) \
    -compose DstIn -composite \
    PNG32:"$TMP"

  magick "$TMP" -background none -gravity center -extent "${SIZE}x${SIZE}" \
    PNG32:"$OUTPUT"
else
  python3 - "$INPUT" "$TMP" "$OUTPUT" "$CONTENT" "$RADIUS" "$SIZE" <<'PY'
from PIL import Image, ImageDraw
import sys

input_path, tmp_path, output_path, content, radius, size = sys.argv[1:7]
content = int(content)
radius = int(radius)
size = int(size)

img = Image.open(input_path).convert("RGBA")
img = img.resize((content, content), Image.LANCZOS)

mask = Image.new("L", (content, content), 0)
draw = ImageDraw.Draw(mask)
draw.rounded_rectangle((0, 0, content - 1, content - 1), radius=radius, fill=255)

masked = Image.new("RGBA", (content, content), (0, 0, 0, 0))
masked.paste(img, (0, 0), mask)
masked.save(tmp_path)

result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
offset = ((size - content) // 2, (size - content) // 2)
result.paste(masked, offset)
result.save(output_path)
PY
fi

echo "Wrote $OUTPUT (${SIZE}x${SIZE}, artwork ${CONTENT}px, radius ${RADIUS}px)"
