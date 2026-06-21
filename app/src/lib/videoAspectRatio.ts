import { resolveArticleVideoUrl } from "@/lib/articleVideoUrl";
import { resolveYouTubeVideoId } from "@/lib/youtube";
import type { Article } from "@/types";

const YOUTUBE_SHORTS_PATH_RE = /\/shorts\//i;

/** height / width for 16:9 landscape video */
export const LANDSCAPE_HEIGHT_RATIO = 9 / 16;
/** height / width for 9:16 portrait video */
export const PORTRAIT_HEIGHT_RATIO = 16 / 9;

export const DEFAULT_VIDEO_HEIGHT_RATIO = PORTRAIT_HEIGHT_RATIO;

type Listener = () => void;

const reportedRatios = new Map<string, number>();
const listeners = new Set<Listener>();

export function reportSessionVideoAspectRatio(
  sessionId: string,
  heightOverWidth: number,
): void {
  if (!Number.isFinite(heightOverWidth) || heightOverWidth <= 0) return;
  const existing = reportedRatios.get(sessionId);
  if (existing !== undefined && Math.abs(existing - heightOverWidth) < 0.001) return;
  reportedRatios.set(sessionId, heightOverWidth);
  listeners.forEach(listener => listener());
}

export function subscribeSessionVideoAspectRatios(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReportedSessionAspectRatio(sessionId: string): number | undefined {
  return reportedRatios.get(sessionId);
}

export function clearSessionAspectRatio(sessionId: string): void {
  if (reportedRatios.delete(sessionId)) {
    listeners.forEach(listener => listener());
  }
}

function isYouTubeShort(article: Pick<Article, "sourceUrl" | "videoUrl">): boolean {
  const url = article.sourceUrl ?? article.videoUrl ?? "";
  return YOUTUBE_SHORTS_PATH_RE.test(url);
}

/** Heuristic aspect ratio before metadata is available. */
export function resolveInitialAspectRatio(
  article: Pick<Article, "sourceUrl" | "videoUrl" | "pluginId" | "id">,
): number | null {
  if (resolveYouTubeVideoId(article)) {
    return isYouTubeShort(article) ? PORTRAIT_HEIGHT_RATIO : LANDSCAPE_HEIGHT_RATIO;
  }
  return null;
}

export function probeImageAspectRatio(url: string): Promise<number | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth, naturalHeight } = img;
      if (naturalWidth <= 0 || naturalHeight <= 0) {
        resolve(null);
        return;
      }
      resolve(naturalHeight / naturalWidth);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function probeVideoAspectRatio(url: string): Promise<number | null> {
  return new Promise(resolve => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const finish = (ratio: number | null) => {
      video.removeAttribute("src");
      video.load();
      resolve(ratio);
    };

    video.onloadedmetadata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        finish(video.videoHeight / video.videoWidth);
        return;
      }
      finish(null);
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}

export function resolveArticleAspectRatioSources(
  article: Article,
): { videoUrl: string | null; imageUrl: string | null; initial: number | null } {
  return {
    videoUrl: resolveArticleVideoUrl(article),
    imageUrl: article.image?.trim() || null,
    initial: resolveInitialAspectRatio(article),
  };
}
