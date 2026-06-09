const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/;
const SHORT_HEX_COLOR_RE = /^#([0-9a-fA-F]{3})$/;

const tailwindColorCache = new Map<string, string>();

/** Tailwind の bg-* クラスまたは hex を #RRGGBB に正規化する */
export function resolveColorToHex(color: string, fallback = "#7c3aed"): string {
  const trimmed = color.trim();
  if (HEX_COLOR_RE.test(trimmed)) return trimmed.toLowerCase();

  const shortMatch = trimmed.match(SHORT_HEX_COLOR_RE);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  if (!trimmed.startsWith("bg-")) return fallback;

  const cached = tailwindColorCache.get(trimmed);
  if (cached) return cached;

  if (typeof document === "undefined") return fallback;

  const el = document.createElement("div");
  el.className = trimmed;
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  el.style.pointerEvents = "none";
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).backgroundColor;
  document.body.removeChild(el);

  const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return fallback;

  const hex = `#${[match[1], match[2], match[3]]
    .map(value => Number(value).toString(16).padStart(2, "0"))
    .join("")}`;
  tailwindColorCache.set(trimmed, hex);
  return hex;
}

export function isHexColor(color: string): boolean {
  return HEX_COLOR_RE.test(color.trim()) || SHORT_HEX_COLOR_RE.test(color.trim());
}
