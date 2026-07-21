import type { Article } from "@/types";

const BLOB_SRC_RE = /^blob:/i;
const DIRECT_AUDIO_URL_RE = /\.(mp3|m4a|aac|ogg|wav|flac|opus)(\?|$)/i;

/** Placeholder URL for list items whose audio must be resolved from detail content. */
export const PENDING_AUDIO_TRACK_URL =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

export function isPendingAudioTrackUrl(url: string): boolean {
  return url === PENDING_AUDIO_TRACK_URL;
}

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

function resolveRelativeMediaUrl(url: string, baseUrl?: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^(https?:|blob:|data:)/i.test(trimmed)) {
    return trimmed;
  }
  const base = baseUrl?.trim();
  if (!base) return trimmed;
  try {
    return new URL(trimmed, base).href;
  } catch {
    return trimmed;
  }
}

function isDirectAudioSourceUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    DIRECT_AUDIO_URL_RE.test(lower)
    || lower.includes("/audio/")
    || lower.includes("audio/mpeg")
  );
}

/** Resolve the best playable URL from a mounted `<audio>` element. */
export function resolveAudioElementSourceUrl(audio: HTMLAudioElement): string | null {
  const directSrc = audio.getAttribute("src")?.trim() ?? "";
  if (isUsableAudioSrc(directSrc)) {
    return directSrc;
  }
  return pickBestAudioSourceUrl(audio.querySelectorAll("source"));
}

/** Extract the primary playable URL from article HTML (`<audio>` only). */
export function extractAudioUrlFromContent(
  html: string,
  baseUrl?: string,
): string | null {
  if (!html.trim()) {
    return null;
  }

  if (typeof DOMParser === "undefined") {
    return null;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const audio of doc.querySelectorAll("audio")) {
    const url = resolveAudioElementSourceUrl(audio);
    if (url) {
      return resolveRelativeMediaUrl(url, baseUrl);
    }
  }

  return null;
}

/** Prefer explicit `audioUrl`, then `<audio>` tags embedded in article HTML. */
export function resolveArticleAudioUrl(
  article: Pick<Article, "audioUrl" | "content" | "sourceUrl">,
): string | null {
  const baseUrl = article.sourceUrl?.trim() || undefined;

  const direct = article.audioUrl?.trim();
  if (direct) {
    return resolveRelativeMediaUrl(direct, baseUrl);
  }

  if (article.content?.trim()) {
    const fromContent = extractAudioUrlFromContent(article.content, baseUrl);
    if (fromContent) return fromContent;
  }

  const source = article.sourceUrl?.trim();
  if (source && isDirectAudioSourceUrl(source)) {
    return resolveRelativeMediaUrl(source, baseUrl);
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

/** Remove inline `<audio>` blocks when the dedicated reader player handles playback. */
export function stripEmbeddedAudioFromContent(html: string): string {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;

  for (const audio of doc.querySelectorAll("audio")) {
    const parent = audio.parentElement;
    audio.remove();
    changed = true;

    if (
      parent
      && (parent.tagName === "P" || parent.tagName === "DIV")
      && !parent.textContent?.trim()
      && !parent.querySelector("img,video,iframe,audio,source")
    ) {
      parent.remove();
    }
  }

  return changed ? doc.body.innerHTML : html;
}
