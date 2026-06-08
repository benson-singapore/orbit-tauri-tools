import type { Article } from "@/types";

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_HOST_RE = /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i;

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

export function youtubeEmbedUrl(videoId: string): string {
  // fs=0 hides YouTube's native fullscreen control (broken in macOS WKWebView).
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&fs=0`;
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
