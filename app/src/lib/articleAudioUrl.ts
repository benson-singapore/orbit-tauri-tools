import type { Article } from "@/types";

const BLOB_SRC_RE = /^blob:/i;

function isUsableAudioSrc(src: string): boolean {
  const trimmed = src.trim();
  return trimmed.length > 0 && !BLOB_SRC_RE.test(trimmed);
}

function pickBestAudioSourceUrl(sources: Iterable<Element>): string | null {
  for (const source of sources) {
    const src = source.getAttribute("src")?.trim() ?? "";
    if (isUsableAudioSrc(src)) return src;
  }
  return null;
}

/** Resolve the best playable URL from a mounted `<audio>` element. */
export function resolveAudioElementSourceUrl(audio: HTMLAudioElement): string | null {
  const directSrc = audio.getAttribute("src")?.trim() ?? "";
  if (isUsableAudioSrc(directSrc)) {
    return directSrc;
  }
  return pickBestAudioSourceUrl(audio.querySelectorAll("source"));
}

/** Extract the primary playable URL from article HTML (`<audio>` / `<source>`). */
export function extractAudioUrlFromContent(html: string): string | null {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return null;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const audio of doc.querySelectorAll("audio")) {
    const url = resolveAudioElementSourceUrl(audio);
    if (url) return url;
  }

  return pickBestAudioSourceUrl(doc.querySelectorAll("source"));
}

function isDirectMediaUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    /\.(mp3|m4a|aac|ogg|wav|flac|opus|m3u8)(\?|$)/i.test(lower)
    || lower.includes("/audio/")
    || lower.includes("audio/mpeg")
    || lower.includes("application/vnd.apple.mpegurl")
  );
}

/** Prefer explicit `audioUrl`, then URLs embedded in article HTML. */
export function resolveArticleAudioUrl(
  article: Pick<Article, "audioUrl" | "content" | "sourceUrl" | "type">,
): string | null {
  const direct = article.audioUrl?.trim();
  if (direct) return direct;

  if (article.content?.trim()) {
    const fromContent = extractAudioUrlFromContent(article.content);
    if (fromContent) return fromContent;
  }

  const source = article.sourceUrl?.trim();
  if (source && isDirectMediaUrl(source)) {
    return source;
  }

  return null;
}

export function articleHasPlayableAudio(
  article: Pick<Article, "type" | "audioUrl" | "content" | "sourceUrl">,
): boolean {
  return resolveArticleAudioUrl(article) !== null;
}

export function isHlsAudioUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes(".m3u8") || lower.includes("application/vnd.apple.mpegurl");
}
