import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  COMIC_PRELOAD_REMAINING_PAGES,
  comicChapterStreamSignature,
  countMangaRemainingPages,
  prepareChapterDisplayContent,
  prepareComicStreamSlotHtml,
  syncComicLazyImages,
} from "@/lib/comicChapterContent";
import { runtimeOpenChapterDetail } from "@/lib/runtimeV2";
import type { Article, ThemeMode } from "@/types";

export type ComicStreamSlotStatus = "loading" | "ready" | "error";

export interface ComicStreamSlot {
  chapter: Article;
  contentHtml: string;
  status: ComicStreamSlotStatus;
}

interface PrefetchEntry {
  chapterId: string;
  detail: Article | null;
  html: string | null;
  failed: boolean;
}

export interface UseComicChapterStreamOptions {
  enabled: boolean;
  parent: Article | null;
  chapterItems: Article[];
  activeChapter: Article | null;
  activeChapterDetail: Article | null;
  detailLoading?: boolean;
  channelId: string;
  runtimeBase: string | null;
  theme: ThemeMode;
  scrollRootRef: RefObject<HTMLElement | null>;
  onVisibleChapterChange?: (chapter: Article) => void;
}

export function useComicChapterStream({
  enabled,
  parent,
  chapterItems,
  activeChapter,
  activeChapterDetail,
  detailLoading = false,
  channelId,
  runtimeBase,
  theme,
  scrollRootRef,
  onVisibleChapterChange,
}: UseComicChapterStreamOptions) {
  const [slots, setSlots] = useState<ComicStreamSlot[]>([]);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [visibleChapter, setVisibleChapter] = useState<Article | null>(null);

  const streamContainerRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef(slots);
  const chapterItemsRef = useRef(chapterItems);
  const pendingScrollAdjustRef = useRef(0);
  const pendingScrollToChapterRef = useRef<string | null>(null);
  const appendLockRef = useRef(false);
  const prefetchLockRef = useRef(false);
  const prefetchRef = useRef<PrefetchEntry | null>(null);
  const appendedChapterIdsRef = useRef<Set<string>>(new Set());
  const seedGenerationRef = useRef(0);
  const visibleChapterRef = useRef<Article | null>(null);
  const onVisibleChapterChangeRef = useRef(onVisibleChapterChange);
  onVisibleChapterChangeRef.current = onVisibleChapterChange;
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

  const prepareStreamHtml = useCallback(
    (detail: Article): string => {
      const html = prepareChapterDisplayContent(detail, runtimeBase, theme);
      return html ? prepareComicStreamSlotHtml(html) : "";
    },
    [runtimeBase, theme],
  );

  const updateChapterSlot = useCallback(
    (chapterId: string, detail: Article, html: string) => {
      const signature = html ? comicChapterStreamSignature(html) : "";
      setSlots(prev =>
        prev.map(slot => {
          if (slot.chapter.id !== chapterId) return slot;
          if (
            html
            && slot.contentHtml
            && slot.status === "ready"
            && comicChapterStreamSignature(slot.contentHtml) === signature
          ) {
            return { ...slot, chapter: detail };
          }
          return {
            chapter: detail,
            contentHtml: html,
            status: html ? "ready" : "error",
          };
        }),
      );
    },
    [],
  );

  const notifyVisibleChapter = useCallback((chapter: Article) => {
    const p = parentRef.current;
    const enriched = p && !chapter.pluginId
      ? { ...chapter, pluginId: p.pluginId }
      : chapter;
    if (visibleChapterRef.current?.id === enriched.id) return;
    visibleChapterRef.current = enriched;
    setVisibleChapter(enriched);
    onVisibleChapterChangeRef.current?.(enriched);
  }, []);

  const resolveNextChapter = useCallback((): Article | null => {
    const currentSlots = slotsRef.current;
    if (currentSlots.length === 0) return null;
    const lastSlot = currentSlots[currentSlots.length - 1];
    const items = chapterItemsRef.current;
    const lastIdx = items.findIndex(item => item.id === lastSlot.chapter.id);
    if (lastIdx < 0 || lastIdx >= items.length - 1) return null;
    return items[lastIdx + 1];
  }, []);

  const tryTrimLeadingSlot = useCallback(() => {
    const scrollRoot = scrollRootRef.current;
    const streamContainer = streamContainerRef.current;
    const currentSlots = slotsRef.current;
    if (!scrollRoot || !streamContainer || currentSlots.length <= 1) return;

    const firstId = currentSlots[0].chapter.id;
    const block = streamContainer.querySelector(`[data-comic-chapter="${firstId}"]`);
    if (!(block instanceof HTMLElement)) return;

    const rootRect = scrollRoot.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    if (blockRect.bottom > rootRect.top) return;

    pendingScrollAdjustRef.current = block.offsetHeight;
    setSlots(prev => prev.slice(1));
  }, [scrollRootRef]);

  const tryAppendReadyChapter = useCallback(
    (detail: Article, html: string) => {
      if (!enabled || !parent || !html) return false;
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
        updateChapterSlot(detail.id, detail, html);
      } else {
        setSlots(prev => [
          ...prev,
          { chapter: detail, contentHtml: html, status: "ready" },
        ]);
      }

      const items = chapterItemsRef.current;
      const idx = items.findIndex(item => item.id === detail.id);
      if (idx >= items.length - 1) {
        setReachedEnd(true);
      }

      appendLockRef.current = false;
      tryTrimLeadingSlot();
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
        || !prefetch.html
      ) {
        return;
      }

      if (tryAppendReadyChapter(prefetch.detail, prefetch.html)) {
        prefetchRef.current = null;
      }
    },
    [tryAppendReadyChapter],
  );

  const tryPrefetchNextChapter = useCallback(async () => {
    if (!enabled || !parent || prefetchLockRef.current || appendLockRef.current) return;

    const nextChapter = resolveNextChapter();
    if (!nextChapter) {
      setReachedEnd(true);
      return;
    }

    const currentSlots = slotsRef.current;
    const existingSlot = currentSlots.find(slot => slot.chapter.id === nextChapter.id);
    if (existingSlot?.status === "ready") return;
    if (prefetchRef.current?.chapterId === nextChapter.id) {
      if (prefetchRef.current.detail && prefetchRef.current.html) {
        tryAppendPrefetchedChapter(nextChapter.id);
        return;
      }
      if (!prefetchRef.current.failed) {
        return;
      }
      prefetchRef.current = null;
    }

    prefetchLockRef.current = true;
    const entry: PrefetchEntry = {
      chapterId: nextChapter.id,
      detail: null,
      html: null,
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

    try {
      const detail = await fetchChapterDetail(nextChapter);
      const html = prepareStreamHtml(detail);
      if (prefetchRef.current?.chapterId !== nextChapter.id) return;

      entry.detail = detail;
      entry.html = html;
      if (html) {
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
      console.error("prefetch comic chapter failed", err);
      if (prefetchRef.current?.chapterId === nextChapter.id) {
        prefetchRef.current.failed = true;
      }
      setSlots(prev => prev.filter(slot => slot.chapter.id !== nextChapter.id));
    } finally {
      prefetchLockRef.current = false;
    }
  }, [
    enabled,
    parent,
    resolveNextChapter,
    fetchChapterDetail,
    prepareStreamHtml,
    tryAppendPrefetchedChapter,
  ]);

  const syncVisibleChapter = useCallback(() => {
    const scrollRoot = scrollRootRef.current;
    const streamContainer = streamContainerRef.current;
    if (!scrollRoot || !streamContainer) return;

    const blocks = Array.from(
      streamContainer.querySelectorAll<HTMLElement>("[data-comic-chapter]"),
    );
    if (blocks.length === 0) return;

    const rootRect = scrollRoot.getBoundingClientRect();
    const focusLine = rootRect.top + rootRect.height * 0.35;

    let bestId: string | null = null;
    let bestTop = -Infinity;

    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      if (rect.bottom <= rootRect.top || rect.top >= rootRect.bottom) continue;
      const id = block.dataset.comicChapter;
      if (!id) continue;
      if (rect.top <= focusLine && rect.top > bestTop) {
        bestTop = rect.top;
        bestId = id;
      }
    }

    if (!bestId) {
      for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        if (rect.bottom <= rootRect.top || rect.top >= rootRect.bottom) continue;
        bestId = block.dataset.comicChapter ?? null;
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
    syncVisibleChapter();

    const scrollRoot = scrollRootRef.current;
    const streamContainer = streamContainerRef.current;
    const currentSlots = slotsRef.current;
    if (streamContainer) {
      syncComicLazyImages(streamContainer, scrollRoot, { runtimeBase });
    }
    if (!scrollRoot || !streamContainer || currentSlots.length === 0) return;

    const lastSlot = currentSlots[currentSlots.length - 1];
    if (lastSlot.status !== "ready") return;

    const block = streamContainer.querySelector(
      `[data-comic-chapter="${lastSlot.chapter.id}"]`,
    );
    const content = block?.querySelector(".article-content");
    if (!(content instanceof HTMLElement)) return;

    const remaining = countMangaRemainingPages(content, scrollRoot);
    if (remaining === null) return;

    if (remaining <= COMIC_PRELOAD_REMAINING_PAGES) {
      void tryPrefetchNextChapter();
    }

    tryTrimLeadingSlot();
  }, [scrollRootRef, syncVisibleChapter, tryPrefetchNextChapter, tryTrimLeadingSlot, runtimeBase]);

  useEffect(() => {
    if (!enabled || !parent || !activeChapter) {
      setSlots([]);
      setReachedEnd(false);
      setVisibleChapter(null);
      visibleChapterRef.current = null;
      prefetchRef.current = null;
      prefetchLockRef.current = false;
      appendedChapterIdsRef.current = new Set();
      return;
    }

    const generation = ++seedGenerationRef.current;
    const items = chapterItems;
    let resolvedChapter = activeChapter;
    let idx = items.findIndex(item => item.id === resolvedChapter.id);
    if (
      idx < 0
      && activeChapterDetail?.id
      && activeChapterDetail.id !== activeChapter.id
    ) {
      const detailIdx = items.findIndex(item => item.id === activeChapterDetail.id);
      if (detailIdx >= 0) {
        idx = detailIdx;
        resolvedChapter = items[detailIdx];
      }
    }
    if (idx < 0) {
      if (activeChapterDetail?.id === activeChapter.id && activeChapterDetail.content?.trim()) {
        const soloHtml = prepareComicStreamSlotHtml(
          prepareChapterDisplayContent(activeChapterDetail, runtimeBase, theme),
        );
        setSlots([
          {
            chapter: activeChapterDetail,
            contentHtml: soloHtml,
            status: soloHtml ? "ready" : "loading",
          },
        ]);
        setReachedEnd(true);
        notifyVisibleChapter(activeChapterDetail);
        if (!soloHtml) {
          void fetchChapterDetail(resolvedChapter)
            .then(detail => {
              if (seedGenerationRef.current !== generation) return;
              const html = prepareStreamHtml(detail);
              updateChapterSlot(resolvedChapter.id, detail, html);
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

    const prevChapter = idx > 0 ? items[idx - 1] : null;
    pendingScrollToChapterRef.current = resolvedChapter.id;
    setReachedEnd(idx >= items.length - 1);
    appendLockRef.current = false;
    prefetchLockRef.current = false;
    prefetchRef.current = null;

    const activeDetail =
      activeChapterDetail?.id === resolvedChapter.id ? activeChapterDetail : resolvedChapter;
    const activeHtml = activeDetail.content?.trim()
      ? prepareComicStreamSlotHtml(
          prepareChapterDisplayContent(activeDetail, runtimeBase, theme),
        )
      : "";

    const initial: ComicStreamSlot[] = [];
    if (prevChapter) {
      initial.push({ chapter: prevChapter, contentHtml: "", status: "loading" });
    }
    initial.push({
      chapter: activeDetail,
      contentHtml: activeHtml,
      status: activeHtml ? "ready" : "loading",
    });
    appendedChapterIdsRef.current = new Set(
      initial.filter(slot => slot.status === "ready").map(slot => slot.chapter.id),
    );
    setSlots(initial);
    notifyVisibleChapter(activeDetail);

    if (prevChapter) {
      void fetchChapterDetail(prevChapter)
        .then(detail => {
          if (seedGenerationRef.current !== generation) return;
          const html = prepareStreamHtml(detail);
          updateChapterSlot(prevChapter.id, detail, html);
        })
        .catch(() => {
          if (seedGenerationRef.current !== generation) return;
          setSlots(prev => prev.filter(slot => slot.chapter.id !== prevChapter.id));
        });
    }

    if (!activeHtml) {
      void fetchChapterDetail(resolvedChapter)
        .then(detail => {
          if (seedGenerationRef.current !== generation) return;
          const html = prepareStreamHtml(detail);
          updateChapterSlot(resolvedChapter.id, detail, html);
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
  }, [
    enabled,
    parent?.id,
    parent?.pluginId,
    activeChapter?.id,
    activeChapterDetail?.id,
    activeChapterDetail?.content,
    chapterItems,
    fetchChapterDetail,
    prepareStreamHtml,
    runtimeBase,
    theme,
    notifyVisibleChapter,
    updateChapterSlot,
  ]);

  useEffect(() => {
    if (!enabled || !activeChapter || !activeChapterDetail) return;
    if (activeChapterDetail.id !== activeChapter.id) return;
    const html = prepareComicStreamSlotHtml(
      prepareChapterDisplayContent(activeChapterDetail, runtimeBase, theme),
    );
    if (!html) return;
    const signature = comicChapterStreamSignature(html);
    setSlots(prev =>
      prev.map(slot => {
        if (slot.chapter.id !== activeChapter.id) return slot;
        if (
          slot.contentHtml
          && slot.status === "ready"
          && comicChapterStreamSignature(slot.contentHtml) === signature
        ) {
          if (slot.chapter === activeChapterDetail) return slot;
          return { ...slot, chapter: activeChapterDetail };
        }
        return {
          chapter: activeChapterDetail,
          contentHtml: html,
          status: "ready",
        };
      }),
    );
  }, [
    enabled,
    activeChapter?.id,
    activeChapterDetail?.content,
    activeChapterDetail?.id,
    runtimeBase,
    theme,
  ]);

  useEffect(() => {
    if (!enabled || detailLoading || !activeChapter) return;
    setSlots(prev => {
      if (prev.length === 0) return prev;
      return prev.map(slot => {
        if (slot.status !== "loading" || slot.chapter.id !== activeChapter.id) {
          return slot;
        }
        if (activeChapterDetail?.id !== activeChapter.id) {
          return slot;
        }
        if (!activeChapterDetail.content?.trim()) {
          return slot;
        }
        const html = prepareComicStreamSlotHtml(
          prepareChapterDisplayContent(activeChapterDetail, runtimeBase, theme),
        );
        if (html) {
          return {
            chapter: activeChapterDetail,
            contentHtml: html,
            status: "ready" as const,
          };
        }
        return { ...slot, status: "error" as const };
      });
    });
  }, [
    enabled,
    detailLoading,
    activeChapter?.id,
    activeChapterDetail?.content,
    activeChapterDetail?.id,
    runtimeBase,
    theme,
  ]);

  useLayoutEffect(() => {
    const adjust = pendingScrollAdjustRef.current;
    if (!adjust || !scrollRootRef.current) return;
    scrollRootRef.current.scrollTop = Math.max(0, scrollRootRef.current.scrollTop - adjust);
    pendingScrollAdjustRef.current = 0;
  }, [slots, scrollRootRef]);

  useLayoutEffect(() => {
    const targetId = pendingScrollToChapterRef.current;
    if (!targetId || !scrollRootRef.current || !streamContainerRef.current) return;

    const block = streamContainerRef.current.querySelector(
      `[data-comic-chapter="${targetId}"]`,
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
    const scrollRoot = scrollRootRef.current;
    const rootRect = scrollRoot.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    scrollRoot.scrollTop += blockRect.top - rootRect.top;
  }, [slots, scrollRootRef]);

  useEffect(() => {
    if (!isActive) return;
    const root = scrollRootRef.current;
    if (!root) return;

    let raf = 0;
    const onScroll = () => {
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
  }, [isActive, checkStreamOnScroll, scrollRootRef, slots.length]);

  useEffect(() => {
    if (!isActive) return;
    window.requestAnimationFrame(() => {
      checkStreamOnScroll();
    });
  }, [isActive, slots, checkStreamOnScroll]);

  return {
    isActive,
    slots,
    reachedEnd,
    visibleChapter,
    streamContainerRef,
  };
}
