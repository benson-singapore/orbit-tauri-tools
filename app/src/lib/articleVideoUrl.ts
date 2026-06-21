import type { Article } from "@/types";

const BLOB_SRC_RE = /^blob:/i;

function isUsableVideoSrc(src: string): boolean {
  const trimmed = src.trim();
  return trimmed.length > 0 && !BLOB_SRC_RE.test(trimmed);
}

function scoreVideoSource(src: string, type: string): number {
  const lowerSrc = src.toLowerCase();
  const lowerType = type.toLowerCase();
  let score = 0;

  if (lowerSrc.includes(".m3u8") || lowerType.includes("mpegurl") || lowerType.includes("m3u8")) {
    score += 20;
  }
  if (lowerSrc.includes(".mp4") || lowerType.includes("mp4")) {
    score += 10;
  }
  if (lowerSrc.includes(".webm") || lowerType.includes("webm")) {
    score += 8;
  }
  if (lowerSrc.startsWith("http://") || lowerSrc.startsWith("https://")) {
    score += 2;
  }

  return score;
}

function pickBestSourceUrl(sources: Iterable<Element>): string | null {
  let bestUrl: string | null = null;
  let bestScore = -1;

  for (const source of sources) {
    const src = source.getAttribute("src")?.trim() ?? "";
    if (!isUsableVideoSrc(src)) continue;

    const type = source.getAttribute("type")?.trim() ?? "";
    const score = scoreVideoSource(src, type);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = src;
    }
  }

  return bestUrl;
}

/** Extract the primary playable URL from article HTML (`<video>` / `<source>`). */
export function extractVideoUrlFromContent(html: string): string | null {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return null;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const video of doc.querySelectorAll("video")) {
    const directSrc = video.getAttribute("src")?.trim() ?? "";
    if (isUsableVideoSrc(directSrc)) {
      return directSrc;
    }

    const fromSource = pickBestSourceUrl(video.querySelectorAll("source"));
    if (fromSource) {
      return fromSource;
    }
  }

  return pickBestSourceUrl(doc.querySelectorAll("source"));
}

/** Prefer explicit `videoUrl`, then URLs embedded in article HTML. */
export function resolveArticleVideoUrl(
  article: Pick<Article, "videoUrl" | "content">,
): string | null {
  const direct = article.videoUrl?.trim();
  if (direct) return direct;

  if (article.content?.trim()) {
    return extractVideoUrlFromContent(article.content);
  }

  return null;
}

export function isHlsVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes(".m3u8") || lower.includes("application/vnd.apple.mpegurl");
}

/** Remove inline `<video>` blocks when the dedicated reader player handles playback. */
export function stripEmbeddedVideosFromContent(html: string): string {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;

  for (const video of doc.querySelectorAll("video")) {
    const parent = video.parentElement;
    video.remove();
    changed = true;

    if (
      parent &&
      (parent.tagName === "P" || parent.tagName === "DIV") &&
      !parent.textContent?.trim() &&
      !parent.querySelector("img,video,iframe,audio,source")
    ) {
      parent.remove();
    }
  }

  return changed ? doc.body.innerHTML : html;
}
