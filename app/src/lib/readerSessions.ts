import type { Article, PlaybackResumeIntent } from "@/types";

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
