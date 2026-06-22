import type { Article } from "@/types";
import { isHttpImageUrl, rewriteHtmlImageUrls } from "@/lib/imageProxy";

const LAZY_IMAGE_ATTRS = ["data-original", "data-src", "data-lazy-src"] as const;

/** Normalize image URLs so CDN variants (query params, tpl suffix) compare equal. */
export function normalizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    let path = parsed.pathname;
    const tilde = path.indexOf("~");
    if (tilde > 0) {
      path = path.slice(0, tilde);
    }
    return `${parsed.hostname}${path}`.toLowerCase();
  } catch {
    let base = trimmed.split("#")[0]?.split("?")[0] ?? trimmed;
    const tilde = base.indexOf("~");
    if (tilde > 0) {
      base = base.slice(0, tilde);
    }
    return base.toLowerCase();
  }
}

export function imagesReferToSameAsset(a: string, b: string): boolean {
  const left = normalizeImageUrl(a);
  const right = normalizeImageUrl(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftName = left.split("/").pop() ?? "";
  const rightName = right.split("/").pop() ?? "";
  return leftName.length > 8 && leftName === rightName;
}

/** Remove the first content image when it duplicates the article cover. */
export function dedupeCoverImageFromContent(
  coverUrl: string | undefined,
  html: string,
): string {
  const cover = coverUrl?.trim();
  const content = html.trim();
  if (!cover || !content || typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(content, "text/html");
  const firstImg = doc.body.querySelector("img");
  if (!firstImg) return html;

  const src =
    firstImg.getAttribute("src") ??
    firstImg.getAttribute("data-src") ??
    "";
  if (!imagesReferToSameAsset(cover, src)) {
    return html;
  }

  const parent = firstImg.parentElement;
  firstImg.remove();

  if (
    parent &&
    (parent.tagName === "P" || parent.tagName === "DIV") &&
    !parent.textContent?.trim() &&
    !parent.querySelector("img,video,iframe,audio,source")
  ) {
    parent.remove();
  }

  return doc.body.innerHTML;
}

/** Resolve lazy-loaded forum images (e.g. Discuz `data-original`) to `src`. */
export function resolveLazyLoadedImages(html: string): string {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;

  for (const img of doc.querySelectorAll("img")) {
    let lazyUrl = "";
    for (const attr of LAZY_IMAGE_ATTRS) {
      const value = img.getAttribute(attr)?.trim() ?? "";
      if (isHttpImageUrl(value)) {
        lazyUrl = value;
        break;
      }
    }
    if (!lazyUrl) continue;

    const src = img.getAttribute("src")?.trim() ?? "";
    if (src === lazyUrl) continue;

    // Prefer the remote lazy URL over placeholders like ./images/thumb-ing.gif.
    if (!src || !isHttpImageUrl(src) || !imagesReferToSameAsset(src, lazyUrl)) {
      img.setAttribute("src", lazyUrl);
      changed = true;
    }
  }

  return changed ? doc.body.innerHTML : html;
}

const DARK_TEXT_LUMINANCE_THRESHOLD = 0.45;

let colorProbe: HTMLDivElement | null = null;

function parseCssColorToRgb(color: string): [number, number, number] | null {
  const trimmed = color.trim();
  if (!trimmed) return null;

  if (typeof document !== "undefined") {
    colorProbe ??= document.createElement("div");
    colorProbe.style.color = "";
    colorProbe.style.color = trimmed;
    const normalized = colorProbe.style.color;
    if (!normalized) return null;
    const rgbMatch = normalized.match(
      /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
    );
    if (rgbMatch) {
      return [
        Number(rgbMatch[1]),
        Number(rgbMatch[2]),
        Number(rgbMatch[3]),
      ];
    }
  }

  const lower = trimmed.toLowerCase();
  if (lower === "black") return [0, 0, 0];
  const hexMatch = lower.match(/^#([0-9a-f]{3,8})$/);
  if (!hexMatch) return null;

  let hex = hexMatch[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map(ch => ch + ch)
      .join("");
  }
  if (hex.length < 6) return null;

  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function isDarkTextColor(color: string): boolean {
  const rgb = parseCssColorToRgb(color);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < DARK_TEXT_LUMINANCE_THRESHOLD;
}

function stripDarkInlineTextColors(root: ParentNode): boolean {
  let changed = false;

  for (const el of root.querySelectorAll("[style]")) {
    const style = (el as HTMLElement).style;
    const color = style.color?.trim() ?? "";
    if (!color || !isDarkTextColor(color)) continue;

    style.removeProperty("color");
    if (!style.cssText.trim()) {
      el.removeAttribute("style");
    }
    changed = true;
  }

  for (const font of root.querySelectorAll("font[color]")) {
    const color = font.getAttribute("color")?.trim() ?? "";
    if (!color || !isDarkTextColor(color)) continue;
    font.removeAttribute("color");
    changed = true;
  }

  return changed;
}

/** Remove publisher inline colors that are too dark for dark-theme reading. */
export function adjustInlineTextColorsForDarkTheme(html: string): string {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  return stripDarkInlineTextColors(doc.body) ? doc.body.innerHTML : html;
}

export function prepareArticleHtmlContent(
  html: string,
  runtimeBase: string | null | undefined,
  options?: { darkTheme?: boolean },
): string {
  let result = rewriteHtmlImageUrls(resolveLazyLoadedImages(html), runtimeBase);
  if (options?.darkTheme) {
    result = adjustInlineTextColorsForDarkTheme(result);
  }
  return result;
}

/** Feed list items omit detail fields; keep them when syncing list metadata. */
export function mergeArticleListWithDetail(
  listItem: Article,
  detail: Article,
): Article {
  return {
    ...listItem,
    content: detail.content,
    galleryImages: detail.galleryImages,
    videoUrl: detail.videoUrl,
    audioUrl: detail.audioUrl,
    audioDuration: detail.audioDuration,
  };
}
