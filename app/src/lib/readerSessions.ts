import type { Article, PlaybackResumeIntent } from "@/types";

export interface AudioFocusPlaybackResume {
  trackIndex: number;
  currentTime: number;
  playing: boolean;
}

export interface AudioFocusDockSession {
  pluginId: string;
  channelId: string;
  articles: Article[];
  playbackResume?: AudioFocusPlaybackResume;
  resolvedUrls?: Record<string, string>;
  resolvedCovers?: Record<string, string>;
  resolvedLyrics?: Record<string, string>;
  resolvedSummaries?: Record<string, string>;
  playlistOrder?: string[];
}

export type ReaderSessionMode = "expanded" | "docked";

export interface ReaderSession {
  id: string;
  article: Article;
  parentArticle?: Article | null;
  mode: ReaderSessionMode;
  activeChannel: string;
  hasDetail: boolean;
  /** Once true, backdrop/Esc dismiss docks instead of closing the session. */
  autoDockOnDismiss: boolean;
  resumeIntent?: PlaybackResumeIntent;
  /**
   * Special dock session for "audioFocus" (channel audio playlist) so the
   * playlist player can keep running across plugin switches.
   */
  audioFocusDock?: AudioFocusDockSession;
}

export function createReaderSession(
  article: Article,
  activeChannel: string,
  hasDetail: boolean,
  resumeIntent?: PlaybackResumeIntent,
  parentArticle?: Article | null,
): ReaderSession {
  return {
    id: `${article.pluginId}:${article.id}:${Date.now()}`,
    article,
    parentArticle: parentArticle ?? null,
    mode: "expanded",
    activeChannel,
    hasDetail,
    autoDockOnDismiss: false,
    resumeIntent,
  };
}

export function articleSessionKey(article: Pick<Article, "id" | "pluginId">): string {
  return `${article.pluginId}:${article.id}`;
}
