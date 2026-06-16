/** Host suffixes that reject cross-origin Referer (hotlink protection). */
const REFERER_PROTECTED_HOST_SUFFIXES = [
  "doubanio.com",
  "douban.com",
  "hellogithub.com",
];

export function isHttpImageUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

export function imageNeedsRefererProxy(url: string): boolean {
  if (!isHttpImageUrl(url)) return false;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return REFERER_PROTECTED_HOST_SUFFIXES.some(
      suffix => host === suffix || host.endsWith("." + suffix),
    );
  } catch {
    return false;
  }
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
  if (!trimmed || !runtimeBase || !imageNeedsRefererProxy(trimmed)) {
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
      if (!raw || !imageNeedsRefererProxy(raw)) continue;
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

/** Retry article body images through the runtime proxy after a direct load fails. */
export function bindArticleContentImages(
  root: HTMLElement | null,
  runtimeBase: string | null | undefined,
): void {
  if (!root || !runtimeBase) return;

  root.querySelectorAll("img").forEach(img => {
    const original = resolveArticleImageOriginal(img);
    if (!original) return;

    img.onerror = () => {
      if (isProxiedImageUrl(img.src)) return;
      img.src = buildImageProxyUrl(runtimeBase, original);
    };
  });
}
