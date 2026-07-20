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

function mergeChapterItems(prev: Article[], nextItems: Article[]): Article[] {
  if (nextItems.length === 0) return prev;
  const existing = new Set(prev.map(item => item.id));
  const merged = [...prev];
  for (const item of nextItems) {
    if (!existing.has(item.id)) {
      existing.add(item.id);
      merged.push(item);
    }
  }
  return merged;
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
  const resumeSeekLockRef = useRef(false);
  // One-shot gate: chapter list pagination must not keep re-applying resume.
  const initialResumeDoneRef = useRef(false);
  const itemsRef = useRef<Article[]>([]);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const activeChapterRef = useRef<Article | null>(null);
  activeChapterRef.current = activeChapter;
  itemsRef.current = items;
  hasMoreRef.current = hasMore;
  loadingMoreRef.current = loadingMore;
  const onChapterDetailRef = useRef(onChapterDetail);
  onChapterDetailRef.current = onChapterDetail;
  const onChapterDetailLoadedRef = useRef(onChapterDetailLoaded);
  onChapterDetailLoadedRef.current = onChapterDetailLoaded;
  const initialChapterIdRef = useRef(initialChapterId);
  initialChapterIdRef.current = initialChapterId;
  const pluginMetaRef = useRef(pluginMeta);
  pluginMetaRef.current = pluginMeta;
  const activeChannelRef = useRef(activeChannel);
  activeChannelRef.current = activeChannel;
  const storedChannelRef = useRef(storedChannel);
  storedChannelRef.current = storedChannel;
  const parentRef = useRef(parent);
  parentRef.current = parent;
  const openSessionKeyRef = useRef<string | null>(null);

  const resolveChannelId = useCallback(
    (article: Article) =>
      resolveArticleDetailChannel(
        article,
        pluginMetaRef.current,
        activeChannelRef.current,
        storedChannelRef.current,
      ),
    [],
  );

  const loadChapterDetail = useCallback(
    (chapter: Article, parentArticle: Article, options?: { force?: boolean }) => {
      // Avoid re-fetching the chapter already on screen (list pagination / resume
      // re-entry used to flip detailLoading and remount comic images → CDN 403).
      if (!options?.force && activeChapterRef.current?.id === chapter.id) {
        return Promise.resolve(activeChapterRef.current);
      }
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
        .finally(() => {
          setDetailLoading(false);
        });
    },
    [resolveChannelId],
  );
  const loadChapterDetailRef = useRef(loadChapterDetail);
  loadChapterDetailRef.current = loadChapterDetail;

  const applyRefreshResult = useCallback(
    (result: { items?: Article[]; hasMore?: boolean; title?: string }) => {
      const nextItems = result.items ?? [];
      itemsRef.current = nextItems;
      setItems(nextItems);
      const nextHasMore = Boolean(result.hasMore);
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);
      if (result.title) {
        setTitle(result.title);
      }
      const parentArticle = parentRef.current;
      const first = nextItems[0];
      if (!first || !parentArticle) {
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
      return loadChapterDetailRef.current(target, parentArticle, { force: true });
    },
    [],
  );

  useEffect(() => {
    if (!enabled || !parent) {
      openSessionKeyRef.current = null;
      initialResumeDoneRef.current = false;
      resumeSeekLockRef.current = false;
      itemsRef.current = [];
      hasMoreRef.current = false;
      setItems([]);
      setTitle("");
      setHasMore(false);
      setActiveChapter(null);
      setLoading(false);
      return;
    }

    if (
      !shouldOpenChaptersForArticle(
        parent,
        pluginMetaRef.current,
        activeChannel,
        capabilities,
        storedChannel,
      )
    ) {
      openSessionKeyRef.current = null;
      initialResumeDoneRef.current = false;
      resumeSeekLockRef.current = false;
      itemsRef.current = [];
      hasMoreRef.current = false;
      setItems([]);
      setTitle("");
      setHasMore(false);
      setActiveChapter(null);
      return;
    }

    let cancelled = false;
    const parentArticle = parent;
    const channelId = resolveChannelId(parentArticle);
    const sessionKey = `${parentArticle.pluginId}:${parentArticle.id}:${channelId}:${openToken}`;
    const sessionChanged = openSessionKeyRef.current !== sessionKey;
    openSessionKeyRef.current = sessionKey;

    // Soft re-entry from unstable effect deps must not re-open chapters: that
    // would replace a paginated list with page-1 and remount comic images.
    if (!sessionChanged && itemsRef.current.length > 0) {
      return;
    }

    initialResumeDoneRef.current = false;
    resumeSeekLockRef.current = false;
    itemsRef.current = [];
    hasMoreRef.current = false;
    setItems([]);
    setTitle("");
    setHasMore(false);
    setActiveChapter(null);
    setLoading(true);

    const loadChapters = async () => {
      if (capabilities.canRefreshChapters) {
        try {
          const cached = await fetchRuntimeChapters({
            pluginId: parentArticle.pluginId,
            channelId,
            parentId: parentArticle.id,
          });
          if ((cached.items ?? []).length > 0) {
            return cached;
          }
        } catch (err) {
          console.error("load cached chapters failed", err);
        }
      }
      return runtimeOpenChapters(parentArticle.pluginId, channelId, parentArticle.id);
    };

    void loadChapters()
      .then(result => {
        if (cancelled) return;
        const nextItems = result.items ?? [];
        itemsRef.current = nextItems;
        setItems(nextItems);
        const nextHasMore = Boolean(result.hasMore);
        hasMoreRef.current = nextHasMore;
        setHasMore(nextHasMore);
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
        if (target.id === targetId || !targetId) {
          initialResumeDoneRef.current = true;
        }
        return loadChapterDetailRef.current(target, parentArticle, { force: true });
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
    capabilities.hasChapters,
    capabilities.chaptersLabel,
    capabilities.canRefreshChapters,
    storedChannel,
    resolveChannelId,
  ]);

  useEffect(() => {
    const parentArticle = parentRef.current;
    if (!enabled || !parentArticle) return;
    if (!initialChapterId) return;
    if (initialResumeDoneRef.current) return;
    if (items.length === 0) return;
    if (loading || detailLoading) return;
    if (activeChapter?.id === initialChapterId) {
      initialResumeDoneRef.current = true;
      return;
    }

    const target = items.find(item => item.id === initialChapterId);
    if (!target) return;

    // Don't steal focus once the user has moved past the default first chapter.
    const firstId = items[0]?.id;
    if (activeChapter?.id && activeChapter.id !== firstId) {
      initialResumeDoneRef.current = true;
      return;
    }

    initialResumeDoneRef.current = true;
    void loadChapterDetailRef.current(target, parentArticle);
  }, [
    enabled,
    parent?.id,
    parent?.pluginId,
    initialChapterId,
    items.length,
    loading,
    detailLoading,
    activeChapter?.id,
  ]);

  useEffect(() => {
    const parentArticle = parentRef.current;
    if (!enabled || !parentArticle) return;
    if (!initialChapterId) return;
    if (initialResumeDoneRef.current) return;
    if (items.length === 0) return;
    if (loading || loadingMore || refreshing || detailLoading) return;
    if (!capabilities.canLoadMoreChapters) return;
    if (!hasMore) return;
    if (resumeSeekLockRef.current) return;
    if (activeChapter?.id === initialChapterId) {
      initialResumeDoneRef.current = true;
      return;
    }

    const firstId = items[0]?.id;
    const autoSeekAllowed = !activeChapter?.id || activeChapter.id === firstId;
    if (!autoSeekAllowed) {
      initialResumeDoneRef.current = true;
      return;
    }

    if (items.some(item => item.id === initialChapterId)) return;

    resumeSeekLockRef.current = true;
    let cancelled = false;

    const run = async () => {
      try {
        const channelId = resolveChannelId(parentArticle);
        let merged = [...itemsRef.current];
        // Avoid runaway loops if a plugin returns inconsistent pagination.
        for (let i = 0; i < 25; i += 1) {
          if (cancelled) return;

          const result = await runtimeLoadMoreChapters(
            parentArticle.pluginId,
            channelId,
            parentArticle.id,
          );
          const nextItems = result.items ?? [];

          if (nextItems.length > 0) {
            merged = mergeChapterItems(merged, nextItems);
            itemsRef.current = merged;
            setItems(merged);
          }
          if (result.title) {
            setTitle(result.title);
          }
          const nextHasMore = Boolean(result.hasMore);
          hasMoreRef.current = nextHasMore;
          setHasMore(nextHasMore);

          const target = merged.find(item => item.id === initialChapterId);
          if (target) {
            initialResumeDoneRef.current = true;
            void loadChapterDetailRef.current(target, parentArticle);
            return;
          }

          if (!result.hasMore || nextItems.length === 0) return;
        }
      } catch (err) {
        console.error("seek resume chapter failed", err);
      }
    };

    void run().finally(() => {
      resumeSeekLockRef.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    parent?.id,
    parent?.pluginId,
    initialChapterId,
    items.length,
    loading,
    loadingMore,
    refreshing,
    detailLoading,
    capabilities.canLoadMoreChapters,
    hasMore,
    activeChapter?.id,
    resolveChannelId,
  ]);

  const selectChapter = useCallback(
    (chapter: Article) => {
      if (!parent) return Promise.resolve(null);
      return loadChapterDetail(chapter, parent);
    },
    [parent, loadChapterDetail],
  );

  const loadMore = useCallback((): Promise<Article[]> => {
    if (!parent || loadingMoreRef.current || !hasMoreRef.current) {
      return Promise.resolve([]);
    }
    const channelId = resolveChannelId(parent);
    loadingMoreRef.current = true;
    setLoadingMore(true);
    return runtimeLoadMoreChapters(parent.pluginId, channelId, parent.id)
      .then(result => {
        const nextItems = result.items ?? [];
        if (nextItems.length > 0) {
          const merged = mergeChapterItems(itemsRef.current, nextItems);
          itemsRef.current = merged;
          setItems(merged);
        }
        const nextHasMore = Boolean(result.hasMore);
        hasMoreRef.current = nextHasMore;
        setHasMore(nextHasMore);
        if (result.title) {
          setTitle(result.title);
        }
        return nextItems;
      })
      .catch(err => {
        console.error("load more chapters failed", err);
        return [];
      })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [parent, resolveChannelId]);

  const resolveRelativeChapter = useCallback(async (
    fromChapterId: string,
    offset: -1 | 1,
  ): Promise<Article | null> => {
    if (!parent) return null;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const list = itemsRef.current;
      const idx = list.findIndex(item => item.id === fromChapterId);
      if (idx < 0) return null;

      const targetIdx = idx + offset;
      if (targetIdx >= 0 && targetIdx < list.length) {
        return list[targetIdx];
      }
      if (offset < 0 || !hasMoreRef.current || !capabilities.canLoadMoreChapters) {
        return null;
      }

      const appended = await loadMore();
      if (appended.length === 0) return null;
    }
    return null;
  }, [parent, capabilities.canLoadMoreChapters, loadMore]);

  const selectRelativeChapter = useCallback((offset: -1 | 1) => {
    if (!parent) return Promise.resolve(null);
    const current = activeChapterRef.current;
    if (!current) return Promise.resolve(null);
    return resolveRelativeChapter(current.id, offset).then(target => {
      if (!target) return null;
      return loadChapterDetail(target, parent);
    });
  }, [parent, resolveRelativeChapter, loadChapterDetail]);

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
    selectRelativeChapter,
    loadMore,
    refresh,
    clearAndRefresh,
  };
}
