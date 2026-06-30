import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { prepareArticleHtmlContent } from "@/lib/articleContent";
import { enhanceNovelChapterDisplayContent } from "@/lib/novelChapterContent";
import {
  COMIC_CHAPTER_PREFETCH_DISTANCE_PX,
  isNearComicChapterEnd,
} from "@/lib/comicChapterContent";
import { findArticleScrollParent } from "@/lib/playbackResume";
import { runtimeOpenChapterDetail } from "@/lib/runtimeV2";
import { isDarkTheme } from "@/lib/themeMode";
import type { Article, ThemeMode } from "@/types";

export type NovelStreamSlotStatus = "loading" | "ready" | "error";

type NovelStreamSlotContent = {
  html: string;
};

/** Fallback trigger: prefetch when scroll root is near bottom. */
const NOVEL_STREAM_PREFETCH_BOTTOM_DISTANCE_PX = 1200;

function isNovelStreamSlotReady(content: NovelStreamSlotContent): boolean {
  return content.html.trim().length > 0;
}

function resolveStreamScrollRoot(
  streamContainer: HTMLElement | null,
  scrollRootRef: RefObject<HTMLElement | null>,
): HTMLElement | null {
  return findArticleScrollParent(streamContainer) ?? scrollRootRef.current;
}

function resolveReaderStickyOffset(scrollRoot: HTMLElement): number {
  const sticky = scrollRoot.querySelector<HTMLElement>(".sticky.top-0");
  if (!sticky) return 0;
  const rootRect = scrollRoot.getBoundingClientRect();
  const stickyRect = sticky.getBoundingClientRect();
  if (stickyRect.bottom <= rootRect.top || stickyRect.top >= rootRect.bottom) return 0;
  return Math.max(0, stickyRect.bottom - rootRect.top);
}

function alignChapterBlockInScrollRoot(scrollRoot: HTMLElement, block: HTMLElement): void {
  const rootRect = scrollRoot.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  const stickyOffset = resolveReaderStickyOffset(scrollRoot);
  scrollRoot.scrollTop += blockRect.top - (rootRect.top + stickyOffset);
}

export interface NovelStreamSlot {
  chapter: Article;
  contentHtml: string;
  status: NovelStreamSlotStatus;
}

interface PrefetchEntry {
  chapterId: string;
  detail: Article | null;
  content: NovelStreamSlotContent | null;
  failed: boolean;
}

export interface UseNovelChapterStreamOptions {
  enabled: boolean;
  parent: Article | null;
  chapterItems: Article[];
  activeChapter: Article | null;
  activeChapterDetail: Article | null;
  detailLoading?: boolean;
  canLoadMoreChapters?: boolean;
  hasMoreChapters?: boolean;
  loadMoreChapters?: () => Promise<Article[] | void>;
  channelId: string;
  runtimeBase: string | null;
  theme: ThemeMode;
  scrollRootRef: RefObject<HTMLElement | null>;
  onVisibleChapterChange?: (chapter: Article) => void;
  /** Fired when a chapter detail is loaded (initial chapter or prefetched next). */
  onChapterDetailFetched?: (chapter: Article) => void;
}

export function useNovelChapterStream({
  enabled,
  parent,
  chapterItems,
  activeChapter,
  activeChapterDetail,
  detailLoading = false,
  canLoadMoreChapters = false,
  hasMoreChapters = false,
  loadMoreChapters,
  channelId,
  runtimeBase,
  theme,
  scrollRootRef,
  onVisibleChapterChange,
  onChapterDetailFetched,
}: UseNovelChapterStreamOptions) {
  const [slots, setSlots] = useState<NovelStreamSlot[]>([]);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [visibleChapter, setVisibleChapter] = useState<Article | null>(null);

  const streamContainerRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef(slots);
  const chapterItemsRef = useRef(chapterItems);
  const pendingScrollAdjustRef = useRef(0);
  const pendingScrollToChapterRef = useRef<string | null>(null);
  const pendingScrollGenerationRef = useRef(0);
  const lastSeedChapterIdRef = useRef<string | null>(null);
  const lastSeedParentIdRef = useRef<string | null>(null);
  const streamInteractedRef = useRef(false);
  const appendLockRef = useRef(false);
  const prefetchLockRef = useRef(false);
  const prefetchRef = useRef<PrefetchEntry | null>(null);
  const prefetchCooldownUntilRef = useRef(0);
  const appendedChapterIdsRef = useRef<Set<string>>(new Set());
  const seedGenerationRef = useRef(0);
  const visibleChapterRef = useRef<Article | null>(null);
  const loadingMoreChaptersRef = useRef(false);
  const schedulePrefetchNextRef = useRef<() => void>(() => {});
  const onVisibleChapterChangeRef = useRef(onVisibleChapterChange);
  onVisibleChapterChangeRef.current = onVisibleChapterChange;
  const onChapterDetailFetchedRef = useRef(onChapterDetailFetched);
  onChapterDetailFetchedRef.current = onChapterDetailFetched;
  const parentRef = useRef(parent);
  parentRef.current = parent;

  slotsRef.current = slots;
  chapterItemsRef.current = chapterItems;

  const isActive = enabled && slots.length > 0;

  const fetchChapterDetail = useCallback(
    async (chapter: Article): Promise<Article> => {
      if (!parent) return chapter;
      const result = await runtimeOpenChapterDetail(
        parent.pluginId,
        channelId,
        parent.id,
        chapter.id,
      );
      return result.item ?? chapter;
    },
    [parent, channelId],
  );

  const prepareStreamContent = useCallback(
    (detail: Article): NovelStreamSlotContent => {
      const raw = detail.content?.trim() ?? "";
      if (!raw) return { html: "" };
      return {
        html: enhanceNovelChapterDisplayContent(
          prepareArticleHtmlContent(raw, runtimeBase, {
            darkTheme: isDarkTheme(theme),
          }),
          detail.title,
        ),
      };
    },
    [runtimeBase, theme],
  );

  const updateChapterSlot = useCallback(
    (chapterId: string, detail: Article, content: NovelStreamSlotContent) => {
      setSlots(prev =>
        prev.map(slot => {
          if (slot.chapter.id !== chapterId) return slot;
          if (
            isNovelStreamSlotReady(content)
            && slot.status === "ready"
            && slot.contentHtml === content.html
          ) {
            return { ...slot, chapter: detail };
          }
          return {
            chapter: detail,
            contentHtml: content.html,
            status: isNovelStreamSlotReady(content) ? "ready" : "error",
          };
        }),
      );
    },
    [],
  );

  const enrichChapter = useCallback((chapter: Article): Article => {
    const p = parentRef.current;
    return p && !chapter.pluginId ? { ...chapter, pluginId: p.pluginId } : chapter;
  }, []);

  const notifyVisibleChapter = useCallback((chapter: Article) => {
    const enriched = enrichChapter(chapter);
    if (visibleChapterRef.current?.id === enriched.id) return;
    visibleChapterRef.current = enriched;
    setVisibleChapter(enriched);
    onVisibleChapterChangeRef.current?.(enriched);
  }, [enrichChapter]);

  const notifyChapterDetailFetched = useCallback((chapter: Article) => {
    onChapterDetailFetchedRef.current?.(enrichChapter(chapter));
  }, [enrichChapter]);

  const fetchChapterDetailRef = useRef(fetchChapterDetail);
  fetchChapterDetailRef.current = fetchChapterDetail;
  const prepareStreamContentRef = useRef(prepareStreamContent);
  prepareStreamContentRef.current = prepareStreamContent;
  const notifyVisibleChapterRef = useRef(notifyVisibleChapter);
  notifyVisibleChapterRef.current = notifyVisibleChapter;
  const notifyChapterDetailFetchedRef = useRef(notifyChapterDetailFetched);
  notifyChapterDetailFetchedRef.current = notifyChapterDetailFetched;
  const updateChapterSlotRef = useRef(updateChapterSlot);
  updateChapterSlotRef.current = updateChapterSlot;
  const activeChapterRef = useRef(activeChapter);
  activeChapterRef.current = activeChapter;
  const activeChapterDetailRef = useRef(activeChapterDetail);
  activeChapterDetailRef.current = activeChapterDetail;
  const detailLoadingRef = useRef(detailLoading);
  detailLoadingRef.current = detailLoading;
  const hasMoreChaptersRef = useRef(hasMoreChapters);
  hasMoreChaptersRef.current = hasMoreChapters;

  const resolveLastReadySlotIndex = useCallback((items: NovelStreamSlot[]): number => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (items[index].status === "ready") return index;
    }
    return -1;
  }, []);

  const resolveNextChapterFromItems = useCallback((items: Article[]): Article | null => {
    const currentSlots = slotsRef.current;
    if (currentSlots.length === 0 || items.length === 0) return null;
    const lastReadyIdx = resolveLastReadySlotIndex(currentSlots);
    if (lastReadyIdx < 0) return null;
    const lastSlot = currentSlots[lastReadyIdx];
    const lastIdx = items.findIndex(item => item.id === lastSlot.chapter.id);
    if (lastIdx < 0) return null;
    if (lastIdx >= items.length - 1) return null;
    return items[lastIdx + 1];
  }, [resolveLastReadySlotIndex]);

  const resolveNextChapter = useCallback((): Article | null => {
    return resolveNextChapterFromItems(chapterItemsRef.current);
  }, [resolveNextChapterFromItems]);

  const mergeChapterListItems = useCallback((appended: Article[]) => {
    if (appended.length === 0) return;
    const existing = new Set(chapterItemsRef.current.map(item => item.id));
    const merged = [...chapterItemsRef.current];
    for (const item of appended) {
      if (!existing.has(item.id)) {
        existing.add(item.id);
        merged.push(item);
      }
    }
    chapterItemsRef.current = merged;
  }, []);

  const ensureMoreChapters = useCallback(async (): Promise<Article[]> => {
    if (!enabled || !parent) return [];
    if (!canLoadMoreChapters || !hasMoreChaptersRef.current) return [];
    if (!loadMoreChapters) return [];
    if (loadingMoreChaptersRef.current) return [];
    loadingMoreChaptersRef.current = true;
    try {
      const result = await loadMoreChapters();
      const appended = Array.isArray(result) ? result : [];
      mergeChapterListItems(appended);
      return appended;
    } finally {
      loadingMoreChaptersRef.current = false;
    }
  }, [enabled, parent, canLoadMoreChapters, loadMoreChapters, mergeChapterListItems]);

  const tryTrimLeadingSlot = useCallback(() => {
    const streamContainer = streamContainerRef.current;
    const scrollRoot = resolveStreamScrollRoot(streamContainer, scrollRootRef);
    const currentSlots = slotsRef.current;
    if (!scrollRoot || !streamContainer || currentSlots.length <= 1) return;

    const firstId = currentSlots[0].chapter.id;
    const block = streamContainer.querySelector(`[data-novel-chapter="${firstId}"]`);
    if (!(block instanceof HTMLElement)) return;

    const rootRect = scrollRoot.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    if (blockRect.bottom > rootRect.top) return;

    pendingScrollAdjustRef.current = block.offsetHeight;
    setSlots(prev => prev.slice(1));
  }, [scrollRootRef]);

  const tryAppendReadyChapter = useCallback(
    (detail: Article, content: NovelStreamSlotContent) => {
      if (!enabled || !parent || !isNovelStreamSlotReady(content)) return false;
      if (appendLockRef.current) return false;

      const currentSlots = slotsRef.current;
      const existing = currentSlots.find(slot => slot.chapter.id === detail.id);
      if (existing?.status === "ready" && existing.contentHtml) {
        appendedChapterIdsRef.current.add(detail.id);
        return true;
      }

      appendLockRef.current = true;
      appendedChapterIdsRef.current.add(detail.id);

      if (existing) {
        updateChapterSlot(detail.id, detail, content);
      } else {
        setSlots(prev => [
          ...prev,
          {
            chapter: detail,
            contentHtml: content.html,
            status: "ready",
          },
        ]);
      }

      const items = chapterItemsRef.current;
      const idx = items.findIndex(item => item.id === detail.id);
      if (idx >= items.length - 1 && !hasMoreChaptersRef.current) {
        setReachedEnd(true);
      }

      appendLockRef.current = false;
      prefetchCooldownUntilRef.current = 0;
      notifyChapterDetailFetchedRef.current(detail);
      tryTrimLeadingSlot();
      schedulePrefetchNextRef.current();
      return true;
    },
    [enabled, parent, tryTrimLeadingSlot, updateChapterSlot],
  );

  const tryAppendPrefetchedChapter = useCallback(
    (chapterId: string) => {
      const prefetch = prefetchRef.current;
      if (
        !prefetch
        || prefetch.chapterId !== chapterId
        || prefetch.failed
        || !prefetch.detail
        || !prefetch.content
        || !isNovelStreamSlotReady(prefetch.content)
      ) {
        return;
      }

      if (tryAppendReadyChapter(prefetch.detail, prefetch.content)) {
        prefetchRef.current = null;
      }
    },
    [tryAppendReadyChapter],
  );

  const tryPrefetchNextChapter = useCallback(async (options?: { fromScrollBottom?: boolean }) => {
    if (!enabled || !parent) return;
    if (prefetchLockRef.current || appendLockRef.current) return;
    if (Date.now() < prefetchCooldownUntilRef.current) return;

    const currentSlots = slotsRef.current;
    const lastReadyIdx = resolveLastReadySlotIndex(currentSlots);
    if (lastReadyIdx < 0) return;

    if (!options?.fromScrollBottom) {
      const visibleId = visibleChapterRef.current?.id;
      if (!visibleId) return;

      const visibleIdx = currentSlots.findIndex(slot => slot.chapter.id === visibleId);
      if (visibleIdx < 0 || visibleIdx !== lastReadyIdx) return;
    }

    prefetchLockRef.current = true;
    let targetChapterId: string | null = null;
    try {
      let nextChapter = resolveNextChapter();
      if (!nextChapter) {
        const appended = await ensureMoreChapters();
        if (appended.length > 0) {
          nextChapter = resolveNextChapterFromItems(chapterItemsRef.current);
        }
        if (!nextChapter) {
          if (appended.length === 0 && !hasMoreChaptersRef.current) {
            setReachedEnd(true);
          }
          return;
        }
      }
      targetChapterId = nextChapter.id;

      const existingSlot = currentSlots.find(slot => slot.chapter.id === nextChapter.id);
      if (existingSlot?.status === "ready") return;
      if (prefetchRef.current?.chapterId === nextChapter.id) {
        if (prefetchRef.current.detail && prefetchRef.current.content) {
          tryAppendPrefetchedChapter(nextChapter.id);
          return;
        }
        if (!prefetchRef.current.failed) {
          return;
        }
        prefetchRef.current = null;
      }

      const entry: PrefetchEntry = {
        chapterId: nextChapter.id,
        detail: null,
        content: null,
        failed: false,
      };
      prefetchRef.current = entry;

      setSlots(prev => {
        if (prev.some(slot => slot.chapter.id === nextChapter.id)) return prev;
        return [
          ...prev,
          { chapter: nextChapter, contentHtml: "", status: "loading" },
        ];
      });

      const detail = await fetchChapterDetail(nextChapter);
      const content = prepareStreamContent(detail);
      if (prefetchRef.current?.chapterId !== nextChapter.id) return;

      entry.detail = detail;
      entry.content = content;
      if (isNovelStreamSlotReady(content)) {
        tryAppendPrefetchedChapter(nextChapter.id);
      } else {
        entry.failed = true;
        setSlots(prev =>
          prev.map(slot =>
            slot.chapter.id === nextChapter.id
              ? { ...slot, status: "error" }
              : slot,
          ),
        );
      }
    } catch (err) {
      console.error("prefetch novel chapter failed", err);
      if (targetChapterId && prefetchRef.current?.chapterId === targetChapterId) {
        prefetchRef.current.failed = true;
      }
      if (targetChapterId) {
        setSlots(prev => prev.filter(slot => slot.chapter.id !== targetChapterId));
      }
    } finally {
      prefetchLockRef.current = false;
    }
  }, [
    enabled,
    parent,
    resolveLastReadySlotIndex,
    resolveNextChapter,
    resolveNextChapterFromItems,
    ensureMoreChapters,
    fetchChapterDetail,
    prepareStreamContent,
    tryAppendPrefetchedChapter,
  ]);

  const tryPrefetchNextChapterRef = useRef(tryPrefetchNextChapter);
  tryPrefetchNextChapterRef.current = tryPrefetchNextChapter;

  const schedulePrefetchNext = useCallback(() => {
    prefetchCooldownUntilRef.current = 0;
    window.requestAnimationFrame(() => {
      void tryPrefetchNextChapterRef.current({ fromScrollBottom: true });
    });
  }, []);

  schedulePrefetchNextRef.current = schedulePrefetchNext;

  const scrollToChapterInStream = useCallback((chapterId: string) => {
    const streamContainer = streamContainerRef.current;
    const scrollRoot = resolveStreamScrollRoot(streamContainer, scrollRootRef);
    if (!scrollRoot || !streamContainer) return false;

    const block = streamContainer.querySelector(`[data-novel-chapter="${chapterId}"]`);
    if (!(block instanceof HTMLElement)) return false;

    alignChapterBlockInScrollRoot(scrollRoot, block);
    streamInteractedRef.current = true;

    const slot = slotsRef.current.find(item => item.chapter.id === chapterId);
    if (slot?.status === "ready") {
      notifyVisibleChapterRef.current(slot.chapter);
    }
    return true;
  }, [scrollRootRef, notifyVisibleChapter]);

  const syncVisibleChapter = useCallback(() => {
    const streamContainer = streamContainerRef.current;
    const scrollRoot = resolveStreamScrollRoot(streamContainer, scrollRootRef);
    if (!scrollRoot || !streamContainer) return;

    const blocks = Array.from(
      streamContainer.querySelectorAll<HTMLElement>("[data-novel-chapter]"),
    );
    if (blocks.length === 0) return;

    const rootRect = scrollRoot.getBoundingClientRect();
    const focusLine = rootRect.top + rootRect.height * 0.35;

    let bestId: string | null = null;
    let bestTop = -Infinity;

    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      if (rect.bottom <= rootRect.top || rect.top >= rootRect.bottom) continue;
      const id = block.dataset.novelChapter;
      if (!id) continue;
      const slot = slotsRef.current.find(item => item.chapter.id === id);
      if (slot?.status !== "ready") continue;
      if (rect.top <= focusLine && rect.top > bestTop) {
        bestTop = rect.top;
        bestId = id;
      }
    }

    if (!bestId) {
      for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        if (rect.bottom <= rootRect.top || rect.top >= rootRect.bottom) continue;
        const id = block.dataset.novelChapter ?? null;
        if (!id) continue;
        const slot = slotsRef.current.find(item => item.chapter.id === id);
        if (slot?.status !== "ready") continue;
        bestId = id;
        if (bestId) break;
      }
    }

    if (!bestId) return;
    const chapter = slotsRef.current.find(slot => slot.chapter.id === bestId)?.chapter;
    if (chapter) {
      notifyVisibleChapter(chapter);
    }
  }, [scrollRootRef, notifyVisibleChapter]);

  const checkStreamOnScroll = useCallback(() => {
    const streamContainer = streamContainerRef.current;
    const scrollRoot = resolveStreamScrollRoot(streamContainer, scrollRootRef);
    const currentSlots = slotsRef.current;
    if (!scrollRoot || !streamContainer || currentSlots.length === 0) return;

    syncVisibleChapter();

    const lastReadyIdx = resolveLastReadySlotIndex(currentSlots);
    const remaining = scrollRoot.scrollHeight - (scrollRoot.scrollTop + scrollRoot.clientHeight);
    if (lastReadyIdx >= 0 && remaining <= NOVEL_STREAM_PREFETCH_BOTTOM_DISTANCE_PX) {
      void tryPrefetchNextChapter({ fromScrollBottom: true });
    }

    const visibleId = visibleChapterRef.current?.id;
    if (!visibleId) {
      tryTrimLeadingSlot();
      return;
    }

    const visibleIdx = currentSlots.findIndex(slot => slot.chapter.id === visibleId);
    if (visibleIdx < 0) {
      tryTrimLeadingSlot();
      return;
    }

    const visibleBlock = streamContainer.querySelector(
      `[data-novel-chapter="${visibleId}"]`,
    );
    if (!(visibleBlock instanceof HTMLElement)) {
      tryTrimLeadingSlot();
      return;
    }

    const visibleSlot = currentSlots[visibleIdx];
    if (
      visibleSlot.status === "ready"
      && visibleIdx === lastReadyIdx
      && isNearComicChapterEnd(visibleBlock, scrollRoot)
    ) {
      void tryPrefetchNextChapter();
    }

    tryTrimLeadingSlot();
  }, [
    scrollRootRef,
    syncVisibleChapter,
    tryPrefetchNextChapter,
    tryTrimLeadingSlot,
    resolveLastReadySlotIndex,
  ]);

  useLayoutEffect(() => {
    if (!enabled || !parent || !activeChapter) {
      setSlots([]);
      setReachedEnd(false);
      setVisibleChapter(null);
      visibleChapterRef.current = null;
      prefetchRef.current = null;
      prefetchLockRef.current = false;
      prefetchCooldownUntilRef.current = 0;
      appendedChapterIdsRef.current = new Set();
      lastSeedChapterIdRef.current = null;
      lastSeedParentIdRef.current = null;
      streamInteractedRef.current = false;
      pendingScrollToChapterRef.current = null;
      pendingScrollGenerationRef.current = 0;
      return;
    }

    const parentId = parent.id;
    const chapterId = activeChapter.id;
    const items = chapterItemsRef.current;
    const shouldReseed = lastSeedChapterIdRef.current !== chapterId
      || lastSeedParentIdRef.current !== parentId;

    if (shouldReseed) {
      const existingIdx = slotsRef.current.findIndex(slot => slot.chapter.id === chapterId);
      if (
        existingIdx >= 0
        && lastSeedParentIdRef.current === parentId
        && slotsRef.current.length > 0
      ) {
        lastSeedChapterIdRef.current = chapterId;
        pendingScrollToChapterRef.current = chapterId;
        pendingScrollGenerationRef.current = seedGenerationRef.current;
        streamInteractedRef.current = false;
        const slot = slotsRef.current[existingIdx];
        if (slot.status === "ready") {
          notifyVisibleChapterRef.current(slot.chapter);
        }
        return;
      }
    } else {
      return;
    }

    if (items.length === 0) {
      return;
    }

    lastSeedChapterIdRef.current = chapterId;
    lastSeedParentIdRef.current = parentId;
    streamInteractedRef.current = false;

    const generation = ++seedGenerationRef.current;
    const activeChapterDetail = activeChapterDetailRef.current;
    let resolvedChapter = activeChapterRef.current ?? activeChapter;
    let idx = items.findIndex(item => item.id === resolvedChapter.id);
    if (
      idx < 0
      && activeChapterDetail?.id
      && activeChapterDetail.id !== resolvedChapter.id
    ) {
      const detailIdx = items.findIndex(item => item.id === activeChapterDetail.id);
      if (detailIdx >= 0) {
        idx = detailIdx;
        resolvedChapter = items[detailIdx];
      }
    }
    if (idx < 0) {
      if (activeChapterDetail?.id === resolvedChapter.id && activeChapterDetail.content?.trim()) {
        const soloContent = prepareStreamContentRef.current(activeChapterDetail);
        setSlots([
          {
            chapter: activeChapterDetail,
            contentHtml: soloContent.html,
            status: isNovelStreamSlotReady(soloContent) ? "ready" : "loading",
          },
        ]);
        setReachedEnd(true);
        notifyVisibleChapterRef.current(activeChapterDetail);
        notifyChapterDetailFetchedRef.current(activeChapterDetail);
        if (!isNovelStreamSlotReady(soloContent)) {
          void fetchChapterDetailRef.current(resolvedChapter)
            .then(detail => {
              if (seedGenerationRef.current !== generation) return;
              updateChapterSlotRef.current(
                resolvedChapter.id,
                detail,
                prepareStreamContentRef.current(detail),
              );
              notifyChapterDetailFetchedRef.current(detail);
            })
            .catch(() => {
              if (seedGenerationRef.current !== generation) return;
              setSlots(prev =>
                prev.map(slot =>
                  slot.chapter.id === resolvedChapter.id
                    ? { ...slot, status: "error" }
                    : slot,
                ),
              );
            });
        }
        return;
      }
      setSlots([]);
      setReachedEnd(false);
      return;
    }

    setReachedEnd(idx >= items.length - 1 && !hasMoreChapters);
    appendLockRef.current = false;
    prefetchLockRef.current = false;
    prefetchRef.current = null;
    prefetchCooldownUntilRef.current = 0;

    const activeDetail =
      activeChapterDetail?.id === resolvedChapter.id ? activeChapterDetail : resolvedChapter;
    const activeContent = activeDetail.content?.trim()
      ? prepareStreamContentRef.current(activeDetail)
      : { html: "" };

    const initial: NovelStreamSlot[] = [];
    initial.push({
      chapter: activeDetail,
      contentHtml: activeContent.html,
      status: isNovelStreamSlotReady(activeContent) ? "ready" : "loading",
    });
    appendedChapterIdsRef.current = new Set(
      initial.filter(slot => slot.status === "ready").map(slot => slot.chapter.id),
    );
    setSlots(initial);
    notifyVisibleChapterRef.current(activeDetail);
    if (isNovelStreamSlotReady(activeContent)) {
      notifyChapterDetailFetchedRef.current(activeDetail);
      schedulePrefetchNextRef.current();
    }

    if (!isNovelStreamSlotReady(activeContent) && !detailLoadingRef.current) {
      void fetchChapterDetailRef.current(resolvedChapter)
        .then(detail => {
          if (seedGenerationRef.current !== generation) return;
          const content = prepareStreamContentRef.current(detail);
          if (!isNovelStreamSlotReady(content)) return;
          updateChapterSlotRef.current(resolvedChapter.id, detail, content);
          notifyChapterDetailFetchedRef.current(detail);
        })
        .catch(() => {
          if (seedGenerationRef.current !== generation) return;
          if (detailLoadingRef.current) return;
          setSlots(prev =>
            prev.map(slot =>
              slot.chapter.id === resolvedChapter.id && slot.status === "loading"
                ? { ...slot, status: "error" }
                : slot,
            ),
          );
        });
    }
  }, [enabled, parent?.id, activeChapter?.id, chapterItems.length, hasMoreChapters]);

  useEffect(() => {
    if (!enabled) return;
    const currentSlots = slotsRef.current;
    if (currentSlots.length === 0) return;

    const lastReadyIdx = resolveLastReadySlotIndex(currentSlots);
    if (lastReadyIdx < 0) return;

    const lastReadyId = currentSlots[lastReadyIdx].chapter.id;
    const idx = chapterItemsRef.current.findIndex(item => item.id === lastReadyId);
    if (idx < 0) return;

    const atLoadedListEnd = idx >= chapterItemsRef.current.length - 1;
    setReachedEnd(atLoadedListEnd && !hasMoreChapters);
  }, [enabled, chapterItems.length, hasMoreChapters, resolveLastReadySlotIndex]);

  useEffect(() => {
    if (!enabled || !activeChapter || !activeChapterDetail) return;
    if (activeChapterDetail.id !== activeChapter.id) return;
    const content = prepareStreamContent(activeChapterDetail);
    if (!isNovelStreamSlotReady(content)) return;
    setSlots(prev =>
      prev.map(slot => {
        if (slot.chapter.id !== activeChapter.id) return slot;
        if (
          slot.status === "ready"
          && slot.contentHtml === content.html
          && slot.chapter === activeChapterDetail
        ) {
          return slot;
        }
        return {
          chapter: activeChapterDetail,
          contentHtml: content.html,
          status: "ready",
        };
      }),
    );
    const idx = chapterItemsRef.current.findIndex(item => item.id === activeChapter.id);
    if (idx >= 0) {
      setReachedEnd(idx >= chapterItemsRef.current.length - 1 && !hasMoreChapters);
    }
  }, [
    enabled,
    activeChapter?.id,
    activeChapterDetail?.content,
    activeChapterDetail?.id,
    hasMoreChapters,
    prepareStreamContent,
  ]);

  useEffect(() => {
    if (!enabled || detailLoading || !activeChapter) return;
    setSlots(prev => {
      if (prev.length === 0) return prev;
      return prev.map(slot => {
        if (slot.chapter.id !== activeChapter.id) {
          return slot;
        }
        if (slot.status === "ready") {
          return slot;
        }
        if (activeChapterDetail?.id !== activeChapter.id) {
          return slot;
        }
        if (!activeChapterDetail.content?.trim()) {
          return slot;
        }
        const content = prepareStreamContent(activeChapterDetail);
        if (isNovelStreamSlotReady(content)) {
          return {
            chapter: activeChapterDetail,
            contentHtml: content.html,
            status: "ready" as const,
          };
        }
        return slot;
      });
    });
  }, [
    enabled,
    detailLoading,
    activeChapter?.id,
    activeChapterDetail?.content,
    activeChapterDetail?.id,
    prepareStreamContent,
  ]);

  useEffect(() => {
    if (!enabled || detailLoading || !activeChapter) return;
    const currentSlot = slotsRef.current.find(slot => slot.chapter.id === activeChapter.id);
    if (!currentSlot || currentSlot.status === "ready") return;

    let cancelled = false;
    void fetchChapterDetailRef.current(activeChapter)
      .then(detail => {
        if (cancelled) return;
        const content = prepareStreamContentRef.current(detail);
        if (!isNovelStreamSlotReady(content)) {
          setSlots(prev =>
            prev.map(slot =>
              slot.chapter.id === activeChapter.id
                ? { ...slot, status: "error" }
                : slot,
            ),
          );
          return;
        }
        updateChapterSlotRef.current(activeChapter.id, detail, content);
        notifyChapterDetailFetchedRef.current(detail);
      })
      .catch(() => {
        if (cancelled) return;
        setSlots(prev =>
          prev.map(slot =>
            slot.chapter.id === activeChapter.id
              ? { ...slot, status: "error" }
              : slot,
          ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, detailLoading, activeChapter?.id]);

  useLayoutEffect(() => {
    const adjust = pendingScrollAdjustRef.current;
    if (!adjust || !scrollRootRef.current) return;
    scrollRootRef.current.scrollTop = Math.max(0, scrollRootRef.current.scrollTop - adjust);
    pendingScrollAdjustRef.current = 0;
  }, [slots, scrollRootRef]);

  useLayoutEffect(() => {
    const targetId = pendingScrollToChapterRef.current;
    const expectedGeneration = pendingScrollGenerationRef.current;
    if (!targetId || !expectedGeneration || !scrollRootRef.current || !streamContainerRef.current) {
      return;
    }
    if (expectedGeneration !== seedGenerationRef.current) {
      pendingScrollToChapterRef.current = null;
      pendingScrollGenerationRef.current = 0;
      return;
    }
    if (streamInteractedRef.current) {
      pendingScrollToChapterRef.current = null;
      pendingScrollGenerationRef.current = 0;
      return;
    }

    const block = streamContainerRef.current.querySelector(
      `[data-novel-chapter="${targetId}"]`,
    );
    if (!(block instanceof HTMLElement)) return;

    const ready = block.querySelector(".article-content");
    if (
      !ready
      && slotsRef.current.some(slot => slot.chapter.id === targetId && slot.status === "loading")
    ) {
      return;
    }

    pendingScrollToChapterRef.current = null;
    pendingScrollGenerationRef.current = 0;
    alignChapterBlockInScrollRoot(scrollRootRef.current, block);
  }, [slots, scrollRootRef]);

  useEffect(() => {
    if (!enabled) return;
    const streamContainer = streamContainerRef.current;
    const root = resolveStreamScrollRoot(streamContainer, scrollRootRef);
    if (!root) return;

    let raf = 0;
    const onScroll = () => {
      streamInteractedRef.current = true;
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        checkStreamOnScroll();
      });
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    window.requestAnimationFrame(() => {
      checkStreamOnScroll();
    });

    return () => {
      root.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(raf);
    };
  }, [enabled, checkStreamOnScroll, scrollRootRef, slots.length]);

  useEffect(() => {
    if (!enabled) return;
    window.requestAnimationFrame(() => {
      checkStreamOnScroll();
    });
  }, [enabled, slots, checkStreamOnScroll]);

  useEffect(() => {
    if (!enabled) return;
    // After chapter list expands via loadMore, retry prefetch without requiring
    // an extra user scroll event.
    window.requestAnimationFrame(() => {
      checkStreamOnScroll();
    });
  }, [enabled, chapterItems.length, checkStreamOnScroll]);

  useEffect(() => {
    if (!enabled || detailLoading) return;
    window.requestAnimationFrame(() => {
      checkStreamOnScroll();
    });
  }, [enabled, detailLoading, checkStreamOnScroll]);

  useLayoutEffect(() => {
    if (!enabled || slots.length === 0) return;
    checkStreamOnScroll();
  }, [enabled, slots.length, checkStreamOnScroll]);

  useEffect(() => {
    if (!enabled || reachedEnd) return;
    const lastReadyIdx = resolveLastReadySlotIndex(slots);
    if (lastReadyIdx < 0 || slots[lastReadyIdx].status !== "ready") return;
    schedulePrefetchNextRef.current();
  }, [enabled, slots, reachedEnd, resolveLastReadySlotIndex]);

  useEffect(() => {
    if (!enabled) return;
    const streamContainer = streamContainerRef.current;
    if (!streamContainer) return;

    const lastReadyIdx = resolveLastReadySlotIndex(slotsRef.current);
    if (lastReadyIdx < 0) return;

    const lastReadyId = slotsRef.current[lastReadyIdx].chapter.id;
    const sentinel = streamContainer.querySelector(
      `[data-novel-chapter-end="${lastReadyId}"]`,
    );
    if (!(sentinel instanceof HTMLElement)) return;

    const scrollRoot = resolveStreamScrollRoot(streamContainer, scrollRootRef);
    if (!scrollRoot) return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void tryPrefetchNextChapter({ fromScrollBottom: true });
          }
        }
      },
      {
        root: scrollRoot,
        rootMargin: `0px 0px ${COMIC_CHAPTER_PREFETCH_DISTANCE_PX}px 0px`,
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    enabled,
    slots,
    tryPrefetchNextChapter,
    scrollRootRef,
    resolveLastReadySlotIndex,
  ]);

  return {
    isActive,
    slots,
    reachedEnd,
    visibleChapter,
    streamContainerRef,
    scrollToChapterInStream,
  };
}
