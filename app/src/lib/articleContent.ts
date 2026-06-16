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

export function prepareArticleHtmlContent(
  html: string,
  runtimeBase: string | null | undefined,
): string {
  return rewriteHtmlImageUrls(resolveLazyLoadedImages(html), runtimeBase);
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
