import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  comicChapterStreamSignature,
  isComicStreamSlotReady,
  isNearComicChapterEnd,
  resolveComicStreamSlotContent,
  syncComicLazyImages,
  syncComicLazyImagesLeading,
} from "@/lib/comicChapterContent";
import { runtimeOpenChapterDetail } from "@/lib/runtimeV2";
import type { Article, ThemeMode } from "@/types";

export type ComicStreamSlotStatus = "loading" | "ready" | "error";

type ComicStreamSlotContent = {
  pageUrls: string[] | null;
  html: string;
};

function slotContentSignature(content: ComicStreamSlotContent): string {
  if (content.pageUrls?.length) return content.pageUrls.join("\n");
  return comicChapterStreamSignature(content.html);
}

export interface ComicStreamSlot {
  chapter: Article;
  contentHtml: string;
  pageUrls: string[] | null;
  status: ComicStreamSlotStatus;
}

interface PrefetchEntry {
  chapterId: string;
  detail: Article | null;
  content: ComicStreamSlotContent | null;
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

  const prepareStreamContent = useCallback(
    (detail: Article): ComicStreamSlotContent => {
      return resolveComicStreamSlotContent(detail, runtimeBase, theme);
    },
    [runtimeBase, theme],
  );

  const updateChapterSlot = useCallback(
    (chapterId: string, detail: Article, content: ComicStreamSlotContent) => {
      const signature = slotContentSignature(content);
      setSlots(prev =>
        prev.map(slot => {
          if (slot.chapter.id !== chapterId) return slot;
          const existingSignature = slot.pageUrls?.length
            ? slot.pageUrls.join("\n")
            : comicChapterStreamSignature(slot.contentHtml);
          if (
            isComicStreamSlotReady(content)
            && slot.status === "ready"
            && isComicStreamSlotReady({ pageUrls: slot.pageUrls, html: slot.contentHtml })
            && existingSignature === signature
          ) {
            return { ...slot, chapter: detail };
          }
          return {
            chapter: detail,
            pageUrls: content.pageUrls,
            contentHtml: content.html,
            status: isComicStreamSlotReady(content) ? "ready" : "error",
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

  const fetchChapterDetailRef = useRef(fetchChapterDetail);
  fetchChapterDetailRef.current = fetchChapterDetail;
  const prepareStreamContentRef = useRef(prepareStreamContent);
  prepareStreamContentRef.current = prepareStreamContent;
  const notifyVisibleChapterRef = useRef(notifyVisibleChapter);
  notifyVisibleChapterRef.current = notifyVisibleChapter;
  const updateChapterSlotRef = useRef(updateChapterSlot);
  updateChapterSlotRef.current = updateChapterSlot;
  const activeChapterRef = useRef(activeChapter);
  activeChapterRef.current = activeChapter;
  const activeChapterDetailRef = useRef(activeChapterDetail);
  activeChapterDetailRef.current = activeChapterDetail;
  const detailLoadingRef = useRef(detailLoading);
  detailLoadingRef.current = detailLoading;

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
    (detail: Article, content: ComicStreamSlotContent) => {
      if (!enabled || !parent || !isComicStreamSlotReady(content)) return false;
      if (appendLockRef.current) return false;

      const currentSlots = slotsRef.current;
      const existing = currentSlots.find(slot => slot.chapter.id === detail.id);
      if (existing?.status === "ready" && (existing.contentHtml || existing.pageUrls?.length)) {
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
            pageUrls: content.pageUrls,
            contentHtml: content.html,
            status: "ready",
          },
        ]);
      }

      const items = chapterItemsRef.current;
      const idx = items.findIndex(item => item.id === detail.id);
      if (idx >= items.length - 1) {
        setReachedEnd(true);
      }

      appendLockRef.current = false;
      prefetchCooldownUntilRef.current = Date.now() + 800;
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
        || !prefetch.content
        || !isComicStreamSlotReady(prefetch.content)
      ) {
        return;
      }

      if (tryAppendReadyChapter(prefetch.detail, prefetch.content)) {
        prefetchRef.current = null;
      }
    },
    [tryAppendReadyChapter],
  );

  const tryPrefetchNextChapter = useCallback(async () => {
    if (!enabled || !parent) return;
    if (prefetchLockRef.current || appendLockRef.current) return;
    if (Date.now() < prefetchCooldownUntilRef.current) return;

    const currentSlots = slotsRef.current;
    const visibleId = visibleChapterRef.current?.id;
    if (!visibleId) return;

    const visibleIdx = currentSlots.findIndex(slot => slot.chapter.id === visibleId);
    if (visibleIdx < 0 || visibleIdx !== currentSlots.length - 1) return;

    const lastSlot = currentSlots[currentSlots.length - 1];
    if (lastSlot.status !== "ready") return;

    prefetchLockRef.current = true;
    let targetChapterId: string | null = null;
    try {
      const nextChapter = resolveNextChapter();
      if (!nextChapter) {
        setReachedEnd(true);
        return;
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
          { chapter: nextChapter, contentHtml: "", pageUrls: null, status: "loading" },
        ];
      });

      const detail = await fetchChapterDetail(nextChapter);
      const content = prepareStreamContent(detail);
      if (prefetchRef.current?.chapterId !== nextChapter.id) return;

      entry.detail = detail;
      entry.content = content;
      if (isComicStreamSlotReady(content)) {
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
    resolveNextChapter,
    fetchChapterDetail,
    prepareStreamContent,
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
        const id = block.dataset.comicChapter ?? null;
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
    syncVisibleChapter();

    const scrollRoot = scrollRootRef.current;
    const streamContainer = streamContainerRef.current;
    const currentSlots = slotsRef.current;
    if (!scrollRoot || !streamContainer || currentSlots.length === 0) return;

    const visibleId = visibleChapterRef.current?.id;
    if (!visibleId) return;

    const visibleIdx = currentSlots.findIndex(slot => slot.chapter.id === visibleId);
    if (visibleIdx < 0) return;

    const visibleBlock = streamContainer.querySelector(
      `[data-comic-chapter="${visibleId}"]`,
    );
    if (!(visibleBlock instanceof HTMLElement)) return;

    const visibleContent = visibleBlock.querySelector(".article-content");
    if (visibleContent instanceof HTMLElement) {
      syncComicLazyImages(visibleContent, scrollRoot, { runtimeBase });
    }

    const nextSlot = visibleIdx < currentSlots.length - 1
      ? currentSlots[visibleIdx + 1]
      : null;
    if (nextSlot?.status === "ready") {
      const nextBlock = streamContainer.querySelector(
        `[data-comic-chapter="${nextSlot.chapter.id}"]`,
      );
      if (nextBlock instanceof HTMLElement) {
        const nextContent = nextBlock.querySelector(".article-content");
        if (nextContent instanceof HTMLElement) {
          syncComicLazyImagesLeading(nextContent, 6, runtimeBase);
        }
      }
    }

    const visibleSlot = currentSlots[visibleIdx];
    if (
      visibleSlot.status === "ready"
      && visibleIdx === currentSlots.length - 1
      && isNearComicChapterEnd(visibleBlock, scrollRoot)
    ) {
      void tryPrefetchNextChapter();
    }

    tryTrimLeadingSlot();
  }, [scrollRootRef, syncVisibleChapter, tryPrefetchNextChapter, tryTrimLeadingSlot, runtimeBase]);

  useEffect(() => {
    if (!enabled || !parent) {
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

    // Keep rendered slots if activeChapter is briefly cleared during a same-parent
    // reload — remounting page images is what triggers CDN 403s.
    if (!activeChapter) {
      return;
    }

    const parentId = parent.id;
    const chapterId = activeChapter.id;
    const items = chapterItemsRef.current;
    const hasReadyActiveSlot = slotsRef.current.some(
      slot => slot.chapter.id === chapterId && slot.status === "ready",
    );
    const streamAlreadySeeded = lastSeedChapterIdRef.current === chapterId
      && lastSeedParentIdRef.current === parentId
      && hasReadyActiveSlot;

    if (streamAlreadySeeded) {
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
            pageUrls: soloContent.pageUrls,
            contentHtml: soloContent.html,
            status: isComicStreamSlotReady(soloContent) ? "ready" : "loading",
          },
        ]);
        setReachedEnd(true);
        notifyVisibleChapterRef.current(activeChapterDetail);
        if (!isComicStreamSlotReady(soloContent)) {
          void fetchChapterDetailRef.current(resolvedChapter)
            .then(detail => {
              if (seedGenerationRef.current !== generation) return;
              updateChapterSlotRef.current(
                resolvedChapter.id,
                detail,
                prepareStreamContentRef.current(detail),
              );
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
    pendingScrollGenerationRef.current = generation;
    setReachedEnd(idx >= items.length - 1);
    appendLockRef.current = false;
    prefetchLockRef.current = false;
    prefetchRef.current = null;
    prefetchCooldownUntilRef.current = 0;

    const activeDetail =
      activeChapterDetail?.id === resolvedChapter.id ? activeChapterDetail : resolvedChapter;
    const activeContent = activeDetail.content?.trim()
      ? prepareStreamContentRef.current(activeDetail)
      : { pageUrls: null, html: "" };

    const initial: ComicStreamSlot[] = [];
    if (prevChapter) {
      initial.push({ chapter: prevChapter, contentHtml: "", pageUrls: null, status: "loading" });
    }
    initial.push({
      chapter: activeDetail,
      pageUrls: activeContent.pageUrls,
      contentHtml: activeContent.html,
      status: isComicStreamSlotReady(activeContent) ? "ready" : "loading",
    });
    appendedChapterIdsRef.current = new Set(
      initial.filter(slot => slot.status === "ready").map(slot => slot.chapter.id),
    );
    setSlots(initial);
    notifyVisibleChapterRef.current(activeDetail);

    if (prevChapter) {
      void fetchChapterDetailRef.current(prevChapter)
        .then(detail => {
          if (seedGenerationRef.current !== generation) return;
          const content = prepareStreamContentRef.current(detail);
          if (!isComicStreamSlotReady(content)) {
            setSlots(prev => prev.filter(slot => slot.chapter.id !== prevChapter.id));
            return;
          }
          updateChapterSlotRef.current(prevChapter.id, detail, content);
        })
        .catch(() => {
          if (seedGenerationRef.current !== generation) return;
          setSlots(prev => prev.filter(slot => slot.chapter.id !== prevChapter.id));
        });
    }

    if (!isComicStreamSlotReady(activeContent) && !detailLoadingRef.current) {
      void fetchChapterDetailRef.current(resolvedChapter)
        .then(detail => {
          if (seedGenerationRef.current !== generation) return;
          const content = prepareStreamContentRef.current(detail);
          if (!isComicStreamSlotReady(content)) return;
          updateChapterSlotRef.current(resolvedChapter.id, detail, content);
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
  }, [enabled, parent?.id, activeChapter?.id, chapterItems.length]);

  useEffect(() => {
    if (!enabled || !activeChapter || !activeChapterDetail) return;
    if (activeChapterDetail.id !== activeChapter.id) return;
    const content = prepareStreamContent(activeChapterDetail);
    if (!isComicStreamSlotReady(content)) return;
    const signature = slotContentSignature(content);
    setSlots(prev =>
      prev.map(slot => {
        if (slot.chapter.id !== activeChapter.id) return slot;
        const existingSignature = slot.pageUrls?.length
          ? slot.pageUrls.join("\n")
          : comicChapterStreamSignature(slot.contentHtml);
        if (
          slot.status === "ready"
          && isComicStreamSlotReady({ pageUrls: slot.pageUrls, html: slot.contentHtml })
          && existingSignature === signature
        ) {
          if (slot.chapter === activeChapterDetail) return slot;
          return { ...slot, chapter: activeChapterDetail };
        }
        return {
          chapter: activeChapterDetail,
          pageUrls: content.pageUrls,
          contentHtml: content.html,
          status: "ready",
        };
      }),
    );
    const idx = chapterItemsRef.current.findIndex(item => item.id === activeChapter.id);
    if (idx >= 0) {
      setReachedEnd(idx >= chapterItemsRef.current.length - 1);
    }
  }, [
    enabled,
    activeChapter?.id,
    activeChapterDetail?.content,
    activeChapterDetail?.id,
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
        if (isComicStreamSlotReady(content)) {
          return {
            chapter: activeChapterDetail,
            pageUrls: content.pageUrls,
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
    pendingScrollGenerationRef.current = 0;
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
