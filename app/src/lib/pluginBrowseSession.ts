import type { Article, PlaybackResumeIntent } from "@/types";

export type PluginBrowseSession = {
  selectedItem: Article | null;
  gridPageDetailOpen: boolean;
  chaptersParent: Article | null;
  splitDetailArticle: Article | null;
  splitDetailFeedChannel: string | null;
  novelPlaybackChapter: Article | null;
  detailResumeIntent?: PlaybackResumeIntent;
  scrollTop: number;
};

const sessions = new Map<string, PluginBrowseSession>();

export function getPluginBrowseSession(pluginId: string): PluginBrowseSession | undefined {
  return sessions.get(pluginId);
}

export function savePluginBrowseSession(pluginId: string, session: PluginBrowseSession): void {
  sessions.set(pluginId, session);
}

export function clearPluginBrowseSession(pluginId: string): void {
  sessions.delete(pluginId);
}

export function createEmptyPluginBrowseSession(): PluginBrowseSession {
  return {
    selectedItem: null,
    gridPageDetailOpen: false,
    chaptersParent: null,
    splitDetailArticle: null,
    splitDetailFeedChannel: null,
    novelPlaybackChapter: null,
    scrollTop: 0,
  };
}
