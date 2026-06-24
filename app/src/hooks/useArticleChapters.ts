import { useCallback, useEffect, useRef, useState } from "react";
import { resolveArticleDetailChannel } from "@/lib/browseDynamicFeed";
import {
  channelHasChapters,
  fetchRuntimeChapters,
  runtimeClearRefreshChapters,
  runtimeLoadMoreChapters,
  runtimeOpenChapterDetail,
  runtimeOpenChapters,
  runtimeRefreshChapters,
  shouldUseRuntimeV2,
} from "@/lib/runtimeV2";
import type { Article, ChannelCapabilities, Plugin } from "@/types";

export function shouldOpenChaptersForArticle(
  article: Article,
  pluginMeta: Plugin | undefined,
  activeChannel: string,
  capabilities: Pick<ChannelCapabilities, "hasChapters">,
  storedChannel?: string | null,
): boolean {
  if (!shouldUseRuntimeV2(article.pluginId, pluginMeta)) return false;
  const channelId = resolveArticleDetailChannel(
    article,
    pluginMeta,
    activeChannel,
    storedChannel,
  );
  if (channelId === "all") return false;
  return capabilities.hasChapters || channelHasChapters(pluginMeta, channelId);
}

interface UseArticleChaptersOptions {
  parent: Article | null;
  activeChannel: string;
  pluginMeta?: Plugin;
  capabilities: Pick<
    ChannelCapabilities,
    | "hasChapters"
    | "chaptersLabel"
    | "canRefreshChapters"
    | "canLoadMoreChapters"
  >;
  storedChannel?: string | null;
  enabled?: boolean;
  initialChapterId?: string;
  openToken?: number;
  onChapterDetail?: (article: Article) => void;
  onChapterDetailLoaded?: (article: Article) => void;
}

export function useArticleChapters({
  parent,
  activeChannel,
  pluginMeta,
  capabilities,
  storedChannel,
  enabled = true,
  initialChapterId,
  openToken = 0,
  onChapterDetail,
  onChapterDetailLoaded,
}: UseArticleChaptersOptions) {
  const [items, setItems] = useState<Article[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [activeChapter, setActiveChapter] = useState<Article | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const activeChapterRef = useRef<Article | null>(null);
  activeChapterRef.current = activeChapter;
  const onChapterDetailRef = useRef(onChapterDetail);
  onChapterDetailRef.current = onChapterDetail;
  const onChapterDetailLoadedRef = useRef(onChapterDetailLoaded);
  onChapterDetailLoadedRef.current = onChapterDetailLoaded;
  const initialChapterIdRef = useRef(initialChapterId);
  initialChapterIdRef.current = initialChapterId;

  const resolveChannelId = useCallback(
    (article: Article) =>
      resolveArticleDetailChannel(article, pluginMeta, activeChannel, storedChannel),
    [pluginMeta, activeChannel, storedChannel],
  );

  const loadChapterDetail = useCallback(
    (chapter: Article, parentArticle: Article) => {
      const channelId = resolveChannelId(parentArticle);
      setActiveChapter(chapter);
      setDetailLoading(true);
      return runtimeOpenChapterDetail(
        parentArticle.pluginId,
        channelId,
        parentArticle.id,
        chapter.id,
      )
        .then(result => {
          if (result.item) {
            onChapterDetailRef.current?.(result.item);
            onChapterDetailLoadedRef.current?.(result.item);
          }
          return result.item ?? chapter;
        })
        .catch(err => {
          console.error("open chapter detail failed", err);
          return chapter;
        })
        .finally(() => setDetailLoading(false));
    },
    [resolveChannelId],
  );

  const applyRefreshResult = useCallback(
    (result: { items?: Article[]; hasMore?: boolean; title?: string }) => {
      const nextItems = result.items ?? [];
      setItems(nextItems);
      setHasMore(Boolean(result.hasMore));
      if (result.title) {
        setTitle(result.title);
      }
      const first = nextItems[0];
      if (!first || !parent) {
        setActiveChapter(null);
        return Promise.resolve(null);
      }
      const resumeId = initialChapterIdRef.current;
      const currentId = activeChapterRef.current?.id;
      const target = (currentId
        ? nextItems.find(item => item.id === currentId)
        : null)
        ?? (resumeId ? nextItems.find(item => item.id === resumeId) : null)
        ?? first;
      return loadChapterDetail(target, parent);
    },
    [parent, loadChapterDetail],
  );

  useEffect(() => {
    if (!enabled || !parent) {
      setItems([]);
      setTitle("");
      setHasMore(false);
      setActiveChapter(null);
      setLoading(false);
      return;
    }

    if (
      !shouldOpenChaptersForArticle(parent, pluginMeta, activeChannel, capabilities, storedChannel)
    ) {
      setItems([]);
      setTitle("");
      setHasMore(false);
      setActiveChapter(null);
      return;
    }

    let cancelled = false;
    const channelId = resolveChannelId(parent);
    setItems([]);
    setTitle("");
    setHasMore(false);
    setActiveChapter(null);
    setLoading(true);

    const loadChapters = async () => {
      if (capabilities.canRefreshChapters) {
        try {
          const cached = await fetchRuntimeChapters({
            pluginId: parent.pluginId,
            channelId,
            parentId: parent.id,
          });
          if ((cached.items ?? []).length > 0) {
            return cached;
          }
        } catch (err) {
          console.error("load cached chapters failed", err);
        }
      }
      return runtimeOpenChapters(parent.pluginId, channelId, parent.id);
    };

    void loadChapters()
      .then(result => {
        if (cancelled) return;
        const nextItems = result.items ?? [];
        setItems(nextItems);
        setHasMore(Boolean(result.hasMore));
        setTitle(result.title ?? capabilities.chaptersLabel ?? "目录");
        const first = nextItems[0];
        if (!first) {
          setActiveChapter(null);
          return;
        }
        const targetId = initialChapterIdRef.current;
        const target = targetId
          ? nextItems.find(item => item.id === targetId) ?? first
          : first;
        return loadChapterDetail(target, parent);
      })
      .catch(err => {
        if (!cancelled) console.error("open chapters failed", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    parent?.id,
    parent?.pluginId,
    enabled,
    openToken,
    activeChannel,
    pluginMeta,
    capabilities.hasChapters,
    capabilities.chaptersLabel,
    capabilities.canRefreshChapters,
    storedChannel,
    resolveChannelId,
    loadChapterDetail,
  ]);

  const selectChapter = useCallback(
    (chapter: Article) => {
      if (!parent) return Promise.resolve(null);
      return loadChapterDetail(chapter, parent);
    },
    [parent, loadChapterDetail],
  );

  const loadMore = useCallback(() => {
    if (!parent || loadingMore || !hasMore) return;
    const channelId = resolveChannelId(parent);
    setLoadingMore(true);
    void runtimeLoadMoreChapters(parent.pluginId, channelId, parent.id)
      .then(result => {
        const nextItems = result.items ?? [];
        setItems(prev => [...prev, ...nextItems]);
        setHasMore(Boolean(result.hasMore));
        if (result.title) {
          setTitle(result.title);
        }
      })
      .catch(err => console.error("load more chapters failed", err))
      .finally(() => setLoadingMore(false));
  }, [parent, loadingMore, hasMore, resolveChannelId]);

  const refresh = useCallback(() => {
    if (!parent || refreshing) return;
    const channelId = resolveChannelId(parent);
    setRefreshing(true);
    void runtimeRefreshChapters(parent.pluginId, channelId, parent.id)
      .then(applyRefreshResult)
      .catch(err => console.error("refresh chapters failed", err))
      .finally(() => setRefreshing(false));
  }, [parent, refreshing, resolveChannelId, applyRefreshResult]);

  const clearAndRefresh = useCallback(() => {
    if (!parent || refreshing) return;
    const channelId = resolveChannelId(parent);
    setRefreshing(true);
    void runtimeClearRefreshChapters(parent.pluginId, channelId, parent.id)
      .then(applyRefreshResult)
      .catch(err => console.error("clear refresh chapters failed", err))
      .finally(() => setRefreshing(false));
  }, [parent, refreshing, resolveChannelId, applyRefreshResult]);

  const isActive = Boolean(
    parent
    && shouldOpenChaptersForArticle(parent, pluginMeta, activeChannel, capabilities, storedChannel),
  );

  return {
    isActive,
    parent,
    items,
    title,
    loading,
    loadingMore,
    refreshing,
    hasMore,
    activeChapter,
    detailLoading,
    selectChapter,
    loadMore,
    refresh,
    clearAndRefresh,
  };
}
