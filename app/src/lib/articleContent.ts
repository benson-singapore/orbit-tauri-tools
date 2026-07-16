import type { Article } from "@/types";
import { isHttpImageUrl, rewriteHtmlImageUrls } from "@/lib/imageProxy";
import {
  extractRycjPlayerScripts,
  normalizeContentSourceButtons,
} from "@/lib/articleContentPlayer";
import {
  applyYouTubeIframeAttributes,
  extractYouTubeVideoId,
  isYouTubeEmbedIframeSrc,
  resolveYouTubeRelayEmbedSrc,
} from "@/lib/youtube";

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
const LIGHT_BG_LUMINANCE_THRESHOLD = 0.72;
const CONTENT_TAG_CLASS = "orbit-content-tag";

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

function colorLuminance(color: string): number | null {
  const rgb = parseCssColorToRgb(color);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function isDarkTextColor(color: string): boolean {
  const luminance = colorLuminance(color);
  return luminance !== null && luminance < DARK_TEXT_LUMINANCE_THRESHOLD;
}

function isLightBackgroundColor(color: string): boolean {
  const luminance = colorLuminance(color);
  return luminance !== null && luminance > LIGHT_BG_LUMINANCE_THRESHOLD;
}

function isPillBorderRadius(value: string): boolean {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("999")) return true;
  if (normalized === "50%") return true;
  const match = normalized.match(/^([\d.]+)(px|rem|em)$/);
  if (!match) return false;
  const amount = Number.parseFloat(match[1]);
  const unit = match[2];
  if (unit === "px") return amount >= 12;
  return amount >= 0.75;
}

function isInlineTagPill(el: HTMLElement): boolean {
  if (el.tagName !== "SPAN") return false;

  const style = el.style;
  const background = style.backgroundColor?.trim() || style.background?.trim() || "";
  if (!background || !isLightBackgroundColor(background)) return false;

  const borderRadius = style.borderRadius?.trim() ?? "";
  if (isPillBorderRadius(borderRadius)) return true;

  const styleAttr = el.getAttribute("style")?.toLowerCase() ?? "";
  return (
    styleAttr.includes("border-radius") &&
    (styleAttr.includes("999") || styleAttr.includes("50%"))
  );
}

function normalizeInlineTagPills(root: ParentNode): boolean {
  let changed = false;

  for (const el of root.querySelectorAll("span[style]")) {
    const span = el as HTMLElement;
    if (!isInlineTagPill(span)) continue;

    span.classList.add(CONTENT_TAG_CLASS);
    span.style.removeProperty("background");
    span.style.removeProperty("background-color");
    span.style.removeProperty("color");
    if (!span.style.cssText.trim()) {
      span.removeAttribute("style");
    }
    changed = true;
  }

  return changed;
}

/** Replace plugin inline tag pills with theme-aware classes. */
export function normalizeContentTagPills(html: string): string {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  return normalizeInlineTagPills(doc.body) ? doc.body.innerHTML : html;
}

function normalizeYouTubeIframes(
  root: ParentNode,
  runtimeBase: string | null | undefined,
): boolean {
  let changed = false;

  for (const el of root.querySelectorAll("iframe")) {
    const iframe = el as HTMLIFrameElement;
    const src = iframe.getAttribute("src")?.trim() ?? "";
    if (!src || !isYouTubeEmbedIframeSrc(src)) continue;
    if (src.includes("/v1/embed/youtube")) continue;

    const videoId = extractYouTubeVideoId(src);
    if (!videoId) continue;

    const relaySrc = resolveYouTubeRelayEmbedSrc(runtimeBase, videoId, {
      title: iframe.getAttribute("title") ?? undefined,
    });
    if (relaySrc && relaySrc !== src) {
      iframe.setAttribute("src", relaySrc);
      changed = true;
    }

    const prevReferrer = iframe.getAttribute("referrerpolicy");
    const prevAllow = iframe.getAttribute("allow");
    applyYouTubeIframeAttributes(iframe);
    if (
      prevReferrer !== iframe.getAttribute("referrerpolicy")
      || prevAllow !== iframe.getAttribute("allow")
    ) {
      changed = true;
    }
  }

  return changed;
}

function normalizeArticleTables(root: ParentNode): boolean {
  let changed = false;

  for (const table of root.querySelectorAll("table")) {
    if (table.hasAttribute("style")) {
      table.removeAttribute("style");
      changed = true;
    }
    for (const attr of ["border", "cellpadding", "cellspacing", "bgcolor", "width"]) {
      if (table.hasAttribute(attr)) {
        table.removeAttribute(attr);
        changed = true;
      }
    }

    for (const cell of table.querySelectorAll("th, td, tr, thead, tbody, tfoot")) {
      if (cell.hasAttribute("style")) {
        cell.removeAttribute("style");
        changed = true;
      }
      for (const attr of ["bgcolor", "border", "width", "height"]) {
        if (cell.hasAttribute(attr)) {
          cell.removeAttribute(attr);
          changed = true;
        }
      }
    }
  }

  return changed;
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
  if (!html.trim() || typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;

  const rewritten = rewriteHtmlImageUrls(resolveLazyLoadedImages(html), runtimeBase);
  if (rewritten !== html) {
    doc.body.innerHTML = rewritten;
    changed = true;
  }

  if (extractRycjPlayerScripts(doc.body)) changed = true;
  if (normalizeInlineTagPills(doc.body)) changed = true;
  if (normalizeContentSourceButtons(doc.body)) changed = true;
  if (normalizeYouTubeIframes(doc.body, runtimeBase)) changed = true;
  if (normalizeArticleTables(doc.body)) changed = true;

  let result = changed ? doc.body.innerHTML : rewritten;
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
