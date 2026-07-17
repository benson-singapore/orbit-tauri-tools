import { READER_AUDIO_SELECTOR } from "@/components/ReaderAudioPlayer";
import { resolveArticleAudioUrl } from "@/lib/articleAudioUrl";
import { collectTimeProgress } from "@/lib/playbackResume";
import { usesDedicatedSessionVideoPlayer } from "@/lib/readerSessionVideos";
import {
  articleSessionKey,
  createReaderSession,
  type ReaderSession,
} from "@/lib/readerSessions";
import {
  getSessionPlaybackSnapshot,
  updateSessionPlaybackSnapshot,
} from "@/lib/sessionVideoProgress";
import { resolveYouTubeVideoId } from "@/lib/youtube";
import type { Article, PlaybackMode, PlaybackResumeIntent } from "@/types";

export interface InlinePlaybackContext {
  article: Article;
  sessionId: string;
  contentRoot: HTMLElement | null;
  pluginId: string;
}

export function hasInlinePlayableMedia(article: Article): boolean {
  if (resolveYouTubeVideoId(article)) return true;
  if (article.videoUrl?.trim()) return true;
  if (resolveArticleAudioUrl(article)) return true;
  return usesDedicatedSessionVideoPlayer(article);
}

function isDomMediaPlaying(root: ParentNode): boolean {
  const audio = root.querySelector(READER_AUDIO_SELECTOR);
  if (audio instanceof HTMLAudioElement && !audio.paused && !audio.ended) {
    return true;
  }

  const video = root.querySelector("#reader-video, video");
  if (video instanceof HTMLVideoElement && !video.paused && !video.ended) {
    return true;
  }

  return false;
}

export function isReaderSessionPlaying(sessionId: string): boolean {
  return Boolean(getSessionPlaybackSnapshot(sessionId)?.playing);
}

export function isInlineMediaPlaying(ctx: InlinePlaybackContext | null): boolean {
  if (!ctx || ctx.pluginId !== ctx.article.pluginId) return false;

  const snapshot = getSessionPlaybackSnapshot(ctx.sessionId);
  if (snapshot?.playing) return true;

  const root = ctx.contentRoot ?? document;
  return isDomMediaPlaying(root);
}

export function snapshotInlinePlaybackForDock(
  sessionId: string,
  contentRoot: HTMLElement | null,
): void {
  const progress = collectTimeProgress(sessionId, contentRoot);
  const position = progress.position ?? 0;
  const root = contentRoot ?? document;

  let playing = getSessionPlaybackSnapshot(sessionId)?.playing ?? false;
  if (!playing) {
    playing = isDomMediaPlaying(root);
  }

  if (position > 0 || playing) {
    updateSessionPlaybackSnapshot(sessionId, {
      currentTime: position,
      playing,
    });
  }
}

function resolveInlinePlaybackMode(article: Article): PlaybackMode {
  if (resolveYouTubeVideoId(article) || article.videoUrl?.trim()) return "video";
  if (resolveArticleAudioUrl(article)) return "audio";
  return "article";
}

function copyPlaybackSnapshot(fromSessionId: string, toSessionId: string): void {
  const snapshot = getSessionPlaybackSnapshot(fromSessionId);
  if (!snapshot) return;
  updateSessionPlaybackSnapshot(toSessionId, snapshot);
}

function buildResumeIntent(
  sessionId: string,
  contentRoot: HTMLElement | null,
  article: Article,
): PlaybackResumeIntent | undefined {
  const mode = resolveInlinePlaybackMode(article);
  if (mode === "article") return undefined;

  const progress = collectTimeProgress(sessionId, contentRoot);
  return { progress, mode };
}

export function dockPlayingExpandedSessions(
  sessions: ReaderSession[],
  pluginId: string,
): ReaderSession[] {
  let changed = false;
  const next = sessions.map(session => {
    if (session.article.pluginId !== pluginId) return session;
    if (session.mode !== "expanded") return session;
    if (!isReaderSessionPlaying(session.id)) return session;
    changed = true;
    return { ...session, mode: "docked" as const, autoDockOnDismiss: true };
  });
  return changed ? next : sessions;
}

export interface DockInlinePlaybackInput {
  sessions: ReaderSession[];
  article: Article;
  parentArticle: Article | null;
  activeChannel: string;
  hasDetail: boolean;
  inlineSessionId: string;
  contentRoot: HTMLElement | null;
}

export interface DockInlinePlaybackResult {
  sessions: ReaderSession[];
  closePageDetail: boolean;
}

export function dockInlinePlaybackToReaderSession(
  input: DockInlinePlaybackInput,
): DockInlinePlaybackResult {
  const {
    sessions,
    article,
    parentArticle,
    activeChannel,
    hasDetail,
    inlineSessionId,
    contentRoot,
  } = input;

  snapshotInlinePlaybackForDock(inlineSessionId, contentRoot);
  const resumeIntent = buildResumeIntent(inlineSessionId, contentRoot, article);

  const key = articleSessionKey(article);
  const existing = sessions.find(session => articleSessionKey(session.article) === key);

  if (existing) {
    copyPlaybackSnapshot(inlineSessionId, existing.id);
    return {
      closePageDetail: true,
      sessions: sessions.map(session => ({
        ...session,
        mode: session.id === existing.id ? "docked" as const : session.mode,
        autoDockOnDismiss: session.id === existing.id ? true : session.autoDockOnDismiss,
        resumeIntent: session.id === existing.id
          ? (resumeIntent ?? session.resumeIntent)
          : session.resumeIntent,
      })),
    };
  }

  const newSession: ReaderSession = {
    ...createReaderSession(article, activeChannel, hasDetail, resumeIntent, parentArticle),
    mode: "docked",
    autoDockOnDismiss: true,
  };
  copyPlaybackSnapshot(inlineSessionId, newSession.id);

  return {
    closePageDetail: true,
    sessions: [
      ...sessions.map(session =>
        session.mode === "expanded"
          ? { ...session, mode: "docked" as const, autoDockOnDismiss: true }
          : session,
      ),
      newSession,
    ],
  };
}
