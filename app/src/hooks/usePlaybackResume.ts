import { useCallback } from "react";
import type { Article, PlaybackRecord } from "@/types";
import { fetchFeedItem } from "@/lib/feed";
import {
  playbackRecordToResumeIntent,
  resolveParentArticleForPlayback,
} from "@/lib/playbackResume";
import type { PlaybackResumeIntent } from "@/types";

interface UsePlaybackResumeOptions {
  pluginId: string;
  articles: Article[];
  onOpen: (article: Article, resumeIntent?: PlaybackResumeIntent) => void;
  onClosePanel?: () => void;
}

export function usePlaybackResume({
  pluginId,
  articles,
  onOpen,
  onClosePanel,
}: UsePlaybackResumeOptions) {
  const resumeFromRecord = useCallback(async (record: PlaybackRecord) => {
    onClosePanel?.();
    const parentArticle = await resolveParentArticleForPlayback(record, pluginId, articles);
    onOpen(parentArticle, playbackRecordToResumeIntent(record));
  }, [articles, onClosePanel, onOpen, pluginId]);

  const resumeByParentId = useCallback(async (
    parentId: string,
    channelId?: string,
  ) => {
    const cached = articles.find(item => item.pluginId === pluginId && item.id === parentId);
    const parentArticle = cached ?? await fetchFeedItem(parentId, { pluginId, channelId });
    onOpen(parentArticle);
  }, [articles, onOpen, pluginId]);

  return { resumeFromRecord, resumeByParentId };
}
