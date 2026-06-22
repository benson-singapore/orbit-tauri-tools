import { resolveArticleVideoUrl } from "@/lib/articleVideoUrl";
import {
  extractActiveRycjVideoUrlFromDom,
  extractRycjVideoUrlFromContent,
  hasInlineArticleContentPlayer,
} from "@/lib/articleContentPlayer";
import { resolveYouTubeVideoId } from "@/lib/youtube";
import type { Article } from "@/types";
import type { ReaderSession } from "@/lib/readerSessions";

export function isVideoArticle(article: Article): boolean {
  if (article.type === "video") return true;
  if (resolveYouTubeVideoId(article) != null) return true;
  return resolveArticleVideoUrl(article) != null;
}

/** YouTube / explicit videoUrl — inline `rycjapi-player` stays in article HTML until promoted. */
export function usesDedicatedSessionVideoPlayer(article: Article): boolean {
  if (resolveYouTubeVideoId(article)) return true;
  if (article.videoUrl?.trim()) return true;
  if (hasInlineArticleContentPlayer(article)) return false;
  return resolveArticleVideoUrl(article) != null;
}

/** Promote inline rycj chapter player to a wall-playable session video URL. */
export function promoteArticleForSessionVideo(
  article: Article,
  contentRoot?: HTMLElement | null,
): Article {
  if (usesDedicatedSessionVideoPlayer(article)) return article;

  const inlineUrl =
    (contentRoot ? extractActiveRycjVideoUrlFromDom(contentRoot) : null)
    ?? extractRycjVideoUrlFromContent(article.content ?? "");
  if (!inlineUrl) return article;

  return { ...article, videoUrl: inlineUrl };
}

export function isVideoReaderSession(session: ReaderSession): boolean {
  return isVideoArticle(session.article);
}

export function isDedicatedVideoReaderSession(session: ReaderSession): boolean {
  return usesDedicatedSessionVideoPlayer(session.article);
}

export function hasDockedVideoSessions(sessions: ReaderSession[]): boolean {
  return sessions.some(session => session.mode === "docked" && isDedicatedVideoReaderSession(session));
}
