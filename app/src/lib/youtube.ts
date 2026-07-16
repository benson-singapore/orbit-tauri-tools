import type { Article } from "@/types";
import { isTauriRuntime } from "@/lib/appInfo";
import { getCachedRuntimeBaseUrl } from "@/lib/runtime";
import { runtimeFetch } from "@/lib/runtimeFetch";

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_HOST_RE = /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i;

export const YOUTUBE_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";

/** Tauri production uses `tauri://localhost`, which cannot send a valid HTTP Referer to YouTube. */
export function needsYouTubeEmbedRelay(): boolean {
  if (typeof window === "undefined") return false;
  const protocol = window.location.protocol;
  return protocol !== "http:" && protocol !== "https:";
}

export function isYouTubeEmbedIframeSrc(src: string): boolean {
  return extractYouTubeVideoId(src) != null;
}

export function applyYouTubeIframeAttributes(iframe: HTMLIFrameElement): void {
  iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  iframe.setAttribute("allow", YOUTUBE_IFRAME_ALLOW);
  iframe.setAttribute("allowfullscreen", "");
}

/** Rewrite direct YouTube embeds through the local runtime relay when required. */
export function resolveYouTubeRelayEmbedSrc(
  runtimeBase: string | null | undefined,
  videoId: string,
  options?: { startSeconds?: number; enableJsApi?: boolean; title?: string },
): string | null {
  if (!needsYouTubeEmbedRelay()) return null;
  const base = resolveRuntimeBaseForEmbed(runtimeBase);
  if (!base) return null;
  return youtubeRuntimeEmbedUrl(base, videoId, options);
}

export function extractYouTubeVideoId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (YOUTUBE_ID_RE.test(value)) return value;

  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.slice(1).split("/")[0];
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }
    const fromQuery = url.searchParams.get("v");
    if (fromQuery && YOUTUBE_ID_RE.test(fromQuery)) return fromQuery;
    const fromPath = url.pathname.match(/\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
    if (fromPath) return fromPath[1];
  } catch {
    // Not a URL — fall through to id-style parsing.
  }

  const lastSegment = value.split(":").pop() ?? "";
  return YOUTUBE_ID_RE.test(lastSegment) ? lastSegment : null;
}

export function isYouTubeArticle(
  item: Pick<Article, "pluginId" | "sourceUrl" | "videoUrl" | "id">,
): boolean {
  if (item.pluginId === "youtube") return true;
  const url = item.sourceUrl ?? item.videoUrl ?? "";
  return YOUTUBE_HOST_RE.test(url);
}

export function resolveYouTubeVideoId(
  item: Pick<Article, "pluginId" | "sourceUrl" | "videoUrl" | "id">,
): string | null {
  if (!isYouTubeArticle(item)) return null;
  return (
    extractYouTubeVideoId(item.sourceUrl ?? "") ??
    extractYouTubeVideoId(item.videoUrl ?? "") ??
    extractYouTubeVideoId(item.id)
  );
}

export function resolveRuntimeBaseForEmbed(
  runtimeBase?: string | null,
): string | null {
  const explicit = runtimeBase?.trim();
  if (explicit) return explicit;
  return getCachedRuntimeBaseUrl();
}

/** Returns true when the runtime exposes the YouTube native stream route. */
export async function verifyYouTubeRuntimePlayback(runtimeBase: string): Promise<boolean> {
  const base = runtimeBase.replace(/\/$/, "");
  try {
    const res = await runtimeFetch(`${base}/v1/youtube/stream?v=invalid`);
    return res.status === 400;
  } catch {
    return false;
  }
}

/** @deprecated use verifyYouTubeRuntimePlayback */
export async function verifyYouTubeRuntimeEmbed(runtimeBase: string): Promise<boolean> {
  return verifyYouTubeRuntimePlayback(runtimeBase);
}

export interface YouTubeStreamInfo {
  streamUrl: string;
  quality: string;
}

export async function fetchYouTubeStream(
  runtimeBase: string,
  videoId: string,
): Promise<YouTubeStreamInfo | null> {
  const base = runtimeBase.replace(/\/$/, "");
  try {
    const res = await runtimeFetch(`${base}/v1/youtube/stream?v=${encodeURIComponent(videoId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      streamUrl?: string;
      quality?: string;
    };
    if (!data.ok || !data.streamUrl?.trim()) return null;
    return {
      streamUrl: data.streamUrl.trim(),
      quality: data.quality?.trim() || "auto",
    };
  } catch {
    return null;
  }
}

export function youtubeSimpleEmbedUrl(videoId: string, startSeconds?: number): string {
  const startParam =
    startSeconds !== undefined && startSeconds > 0
      ? `?start=${Math.floor(startSeconds)}`
      : "";
  return `https://www.youtube.com/embed/${videoId}${startParam}`;
}

export function youtubeEmbedUrl(
  videoId: string,
  startSeconds?: number,
  options?: { enableJsApi?: boolean },
): string {
  const enableJsApi = options?.enableJsApi ?? false;
  const origin =
    enableJsApi && typeof window !== "undefined"
      ? encodeURIComponent(window.location.origin)
      : "";
  const originParam = origin ? `&origin=${origin}` : "";
  const startParam =
    startSeconds !== undefined && startSeconds > 0
      ? `&start=${Math.floor(startSeconds)}`
      : "";
  const jsApiParam = enableJsApi ? "&enablejsapi=1" : "";
  // fs=0 hides YouTube's native fullscreen control (broken in macOS WKWebView).
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&fs=0${jsApiParam}${originParam}${startParam}`;
}

export function youtubeRuntimeEmbedUrl(
  runtimeBase: string,
  videoId: string,
  options?: { startSeconds?: number; enableJsApi?: boolean; title?: string },
): string {
  const base = runtimeBase.replace(/\/$/, "");
  const params = new URLSearchParams({ v: videoId });
  if (options?.enableJsApi) {
    params.set("jsapi", "1");
  }
  if (options?.startSeconds !== undefined && options.startSeconds > 0) {
    params.set("start", String(Math.floor(options.startSeconds)));
  }
  if (options?.title?.trim()) {
    params.set("title", options.title.trim());
  }
  return `${base}/v1/embed/youtube?${params.toString()}`;
}

export function resolveYouTubeEmbedSrc(
  runtimeBase: string | null | undefined,
  videoId: string,
  options?: { startSeconds?: number; enableJsApi?: boolean; title?: string },
): string | null {
  const base = resolveRuntimeBaseForEmbed(runtimeBase);
  if (base) {
    return youtubeRuntimeEmbedUrl(base, videoId, options);
  }
  if (import.meta.env.VITE_ORBIT_RUNTIME_URL || isTauriRuntime()) {
    return null;
  }
  return youtubeEmbedUrl(videoId, options?.startSeconds, {
    enableJsApi: options?.enableJsApi,
  });
}

export function isVideoPluginChannel(
  plugin: { mediaType?: string; icon?: string } | undefined,
  item: Pick<Article, "pluginId" | "sourceUrl" | "videoUrl" | "id" | "type">,
): boolean {
  if (item.type !== "video") return false;
  if (plugin?.mediaType === "video") return true;
  if (plugin?.icon === "video") return true;
  return isYouTubeArticle(item);
}
