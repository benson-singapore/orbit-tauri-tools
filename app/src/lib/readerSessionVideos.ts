import { resolveYouTubeVideoId } from "@/lib/youtube";
import type { Article } from "@/types";
import type { ReaderSession } from "@/lib/readerSessions";

export function isVideoArticle(article: Article): boolean {
  if (article.type === "video") return true;
  return resolveYouTubeVideoId(article) != null;
}

export function isVideoReaderSession(session: ReaderSession): boolean {
  return isVideoArticle(session.article);
}

export function hasDockedVideoSessions(sessions: ReaderSession[]): boolean {
  return sessions.some(session => session.mode === "docked" && isVideoReaderSession(session));
}
