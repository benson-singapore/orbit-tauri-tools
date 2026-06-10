import type { Article } from "@/types";

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
