import { isTauriRuntime } from "@/lib/appInfo";
import { getCachedRuntimeBaseUrl } from "@/lib/runtime";

/** Host suffixes that should load through the runtime image proxy. */
const PROXY_IMAGE_HOST_SUFFIXES = [
  "doubanio.com",
  "douban.com",
  "hellogithub.com",
  "lbupup.cn",
  "uforxk.cn",
  "bgezuw.cn",
  "g-mh.online",
  "mh.online",
];

export function isHttpImageUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

export function imageNeedsProxy(url: string): boolean {
  if (!isHttpImageUrl(url)) return false;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return PROXY_IMAGE_HOST_SUFFIXES.some(
      suffix => host === suffix || host.endsWith("." + suffix),
    );
  } catch {
    return false;
  }
}

/** @deprecated use imageNeedsProxy */
export function imageNeedsRefererProxy(url: string): boolean {
  return imageNeedsProxy(url);
}

export function buildImageProxyUrl(runtimeBase: string, imageUrl: string): string {
  const base = runtimeBase.replace(/\/$/, "");
  return `${base}/v1/images/proxy?url=${encodeURIComponent(imageUrl.trim())}`;
}

/**
 * Comic page images in the Tauri WebView often fail when loaded directly from CDN
 * (hotlink / UA checks). Route through the Go proxy when runtime is available.
 */
export function comicPageImageUrl(
  runtimeBase: string | null | undefined,
  imageUrl: string,
): string {
  const trimmed = imageUrl.trim();
  const base = runtimeBase ?? getCachedRuntimeBaseUrl();
  if (!trimmed || !base || !isHttpImageUrl(trimmed)) return trimmed;
  if (isTauriRuntime() || imageNeedsProxy(trimmed)) {
    return buildImageProxyUrl(base, trimmed);
  }
  return trimmed;
}

export function comicLazyImageNeedsProxyLoad(
  img: HTMLImageElement,
  runtimeBase?: string | null,
): boolean {
  const dataSrc = img.getAttribute("data-src")?.trim() ?? "";
  if (!dataSrc || !isHttpImageUrl(dataSrc)) return false;
  const expected = comicPageImageUrl(runtimeBase, dataSrc);
  return expected !== dataSrc;
}

/** Prefer proxy for hosts with hotlink protection when runtime is available. */
export function displayImageUrl(
  runtimeBase: string | null | undefined,
  imageUrl: string,
): string {
  const trimmed = imageUrl.trim();
  if (!trimmed || !runtimeBase || !imageNeedsProxy(trimmed)) {
    return trimmed;
  }
  return buildImageProxyUrl(runtimeBase, trimmed);
}

export function rewriteHtmlImageUrls(
  html: string,
  runtimeBase: string | null | undefined,
): string {
  if (!html.trim() || !runtimeBase || typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;

  for (const img of doc.querySelectorAll("img")) {
    for (const attr of ["src", "data-src", "data-original"]) {
      const raw = img.getAttribute(attr);
      if (!raw || !imageNeedsProxy(raw)) continue;
      img.setAttribute(attr, buildImageProxyUrl(runtimeBase, raw));
      changed = true;
    }
  }

  return changed ? doc.body.innerHTML : html;
}

export function isProxiedImageUrl(src: string): boolean {
  return src.includes("/v1/images/proxy?url=");
}

function resolveArticleImageOriginal(img: HTMLImageElement): string {
  for (const attr of ["data-original", "data-src", "data-lazy-src"]) {
    const value = img.getAttribute(attr)?.trim() ?? "";
    if (isHttpImageUrl(value)) {
      return value;
    }
  }
  return img.getAttribute("src")?.trim() ?? "";
}

function decodeProxiedImageUrl(src: string): string | null {
  if (!isProxiedImageUrl(src)) return null;
  try {
    const parsed = new URL(src);
    const raw = parsed.searchParams.get("url")?.trim() ?? "";
    return isHttpImageUrl(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function isComicLazyImageActivated(
  img: HTMLImageElement,
  runtimeBase?: string | null,
): boolean {
  if (!img.hasAttribute("data-comic-lazy")) return true;
  const dataSrc = img.getAttribute("data-src")?.trim() ?? "";
  if (!dataSrc) return true;
  const src = img.getAttribute("src")?.trim() ?? "";
  if (!src || src.startsWith("data:")) return false;

  const expectedSrc = comicPageImageUrl(runtimeBase, dataSrc);
  if (src === expectedSrc) {
    if (img.complete && img.naturalWidth === 0) return false;
    return true;
  }
  if (src === dataSrc) {
    if (comicLazyImageNeedsProxyLoad(img, runtimeBase)) return false;
    if (img.complete && img.naturalWidth === 0) return false;
    return true;
  }
  return decodeProxiedImageUrl(src) === dataSrc;
}

function resolveBoundImageOriginal(img: HTMLImageElement): string {
  const fromAttr = resolveArticleImageOriginal(img);
  if (fromAttr) return fromAttr;
  return decodeProxiedImageUrl(img.src) ?? "";
}

/** Comic lazy images keep the real URL in data-src until activated — skip error hooks until then. */
export function isComicLazyImagePending(img: HTMLImageElement, runtimeBase?: string | null): boolean {
  if (!img.hasAttribute("data-comic-lazy")) return false;
  return !isComicLazyImageActivated(img, runtimeBase);
}

function attachArticleImageErrorHandler(
  img: HTMLImageElement,
  runtimeBase: string,
): void {
  const original = resolveBoundImageOriginal(img);
  if (!original) return;

  img.onerror = () => {
    const originalUrl = resolveBoundImageOriginal(img);
    if (!originalUrl) return;

    const retry = img.dataset.orbitImgRetry ?? "";
    if (!retry && isProxiedImageUrl(img.src)) {
      img.dataset.orbitImgRetry = "direct";
      img.referrerPolicy = "no-referrer";
      img.src = originalUrl;
      return;
    }
    if (!retry && !isProxiedImageUrl(img.src)) {
      img.dataset.orbitImgRetry = "proxy";
      img.src = buildImageProxyUrl(runtimeBase, originalUrl);
      return;
    }
    if (retry === "proxy" && isProxiedImageUrl(img.src)) {
      img.dataset.orbitImgRetry = "direct";
      img.referrerPolicy = "no-referrer";
      img.src = originalUrl;
    }
  };
}

export function bindSingleArticleContentImage(
  img: HTMLImageElement,
  runtimeBase: string | null | undefined,
): void {
  const base = runtimeBase ?? getCachedRuntimeBaseUrl();
  if (!base || isComicLazyImagePending(img, base)) return;
  attachArticleImageErrorHandler(img, base);
}

/** Retry article body images through the runtime proxy after a direct load fails. */
export function bindArticleContentImages(
  root: HTMLElement | null,
  runtimeBase: string | null | undefined,
): void {
  if (!root || !runtimeBase) return;

  root.querySelectorAll("img").forEach(img => {
    if (isComicLazyImagePending(img, runtimeBase)) return;
    attachArticleImageErrorHandler(img, runtimeBase);
  });
}
