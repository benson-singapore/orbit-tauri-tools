/** Host suffixes that should load through the runtime image proxy. */
const PROXY_IMAGE_HOST_SUFFIXES = [
  "doubanio.com",
  "douban.com",
  "hellogithub.com",
  "lbupup.cn",
  "uforxk.cn",
  "bgezuw.cn",
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

function resolveBoundImageOriginal(img: HTMLImageElement): string {
  const fromAttr = resolveArticleImageOriginal(img);
  if (fromAttr) return fromAttr;
  return decodeProxiedImageUrl(img.src) ?? "";
}

/** Comic lazy images keep the real URL in data-src until activated — skip error hooks until then. */
export function isComicLazyImagePending(img: HTMLImageElement): boolean {
  if (!img.hasAttribute("data-comic-lazy")) return false;
  const dataSrc = img.getAttribute("data-src")?.trim() ?? "";
  if (!dataSrc) return false;
  const src = img.getAttribute("src")?.trim() ?? "";
  return src !== dataSrc;
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
  if (!runtimeBase || isComicLazyImagePending(img)) return;
  attachArticleImageErrorHandler(img, runtimeBase);
}

/** Retry article body images through the runtime proxy after a direct load fails. */
export function bindArticleContentImages(
  root: HTMLElement | null,
  runtimeBase: string | null | undefined,
): void {
  if (!root || !runtimeBase) return;

  root.querySelectorAll("img").forEach(img => {
    if (isComicLazyImagePending(img)) return;
    attachArticleImageErrorHandler(img, runtimeBase);
  });
}
