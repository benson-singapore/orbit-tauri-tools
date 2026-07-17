import type { Article } from "@/types";

const BLOB_SRC_RE = /^blob:/i;
const DIRECT_MEDIA_URL_RE = /\.(mp3|m4a|aac|ogg|wav|flac|opus|m3u8)(\?|$)/i;
const MEDIA_URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>]+\.(?:mp3|m4a|aac|ogg|wav|flac|opus|m3u8)(?:\?[^\s"'<>]*)?/i;

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

export function isDirectMediaUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    DIRECT_MEDIA_URL_RE.test(lower)
    || lower.includes("/audio/")
    || lower.includes("audio/mpeg")
    || lower.includes("application/vnd.apple.mpegurl")
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

function readAudioUrlFromElement(el: Element): string | null {
  for (const attr of ["src", "data-src", "data-url", "data-audio", "href"]) {
    const value = el.getAttribute(attr)?.trim() ?? "";
    if (isUsableAudioSrc(value) && isDirectMediaUrl(value)) {
      return value;
    }
  }
  return null;
}

/** Extract the primary playable URL from article HTML (`<audio>` / links / text). */
export function extractAudioUrlFromContent(
  html: string,
  baseUrl?: string,
): string | null {
  if (!html.trim()) {
    return null;
  }

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");

    for (const audio of doc.querySelectorAll("audio")) {
      const url = resolveAudioElementSourceUrl(audio);
      if (url) {
        return resolveRelativeMediaUrl(url, baseUrl);
      }
    }

    const fromSource = pickBestAudioSourceUrl(doc.querySelectorAll("source"));
    if (fromSource) {
      return resolveRelativeMediaUrl(fromSource, baseUrl);
    }

    for (const el of doc.querySelectorAll("a[href], [data-src], [data-url], [data-audio]")) {
      const url = readAudioUrlFromElement(el);
      if (url) {
        return resolveRelativeMediaUrl(url, baseUrl);
      }
    }
  }

  const textMatch = html.match(MEDIA_URL_IN_TEXT_RE);
  if (textMatch?.[0]) {
    return resolveRelativeMediaUrl(textMatch[0], baseUrl);
  }

  return null;
}

/** Prefer explicit `audioUrl`, then URLs embedded in article HTML. */
export function resolveArticleAudioUrl(
  article: Pick<Article, "audioUrl" | "content" | "sourceUrl" | "type">,
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
