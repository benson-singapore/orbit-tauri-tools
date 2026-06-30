import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { putPlayback } from "@/lib/playback";
import { resolveChapterReadingPlayback, resolveEffectivePlayback } from "@/lib/playbackConfig";
import { syncComicLazyImages, syncComicStreamVisibleChapterImages } from "@/lib/comicChapterContent";
import {
  collectArticleScrollProgress,
  collectMangaPageProgress,
  collectMangaStreamProgress,
  collectTimeProgress,
  findArticleScrollParent,
  hasMeaningfulProgress,
  isComicContentRoot,
} from "@/lib/playbackResume";
import { snapshotContentVideoProgress } from "@/lib/sessionVideoProgress";
import type {
  Article,
  ChannelCapabilities,
  PlaybackProgress,
  PlaybackRecord,
  Plugin,
  ProgressArticle,
} from "@/types";

const SYNC_INTERVAL_MS = 5000;

export interface UsePlaybackProgressOptions {
  pluginMeta?: Plugin;
  channelId: string;
  /** Channel id stored on playback records; defaults to `channelId`. */
  recordChannelId?: string;
  channelCapabilities?: Pick<ChannelCapabilities, "playback">;
  /** When reading serial chapters, merge feed-channel playback with detail channel. */
  feedChannelId?: string;
  feedChannelCapabilities?: Pick<ChannelCapabilities, "playback">;
  parentArticle: Article | null;
  article: Article | null;
  sessionId?: string;
  contentRef: RefObject<HTMLElement | null>;
  scrollRootRef?: RefObject<HTMLElement | null>;
  runtimeBase?: string | null;
  /** True once article HTML is mounted (not loading). Re-binds scroll tracking. */
  contentReady?: boolean;
  /** Changes when the mounted content surface switches (article vs stream). */
  contentSurfaceKey?: string;
  /** Novel stream: chapter to record in history (updated when chapter detail is fetched). */
  novelChapterRecord?: Article | null;
  /** When set, overrides resolved playback config for history sync. */
  historyEnabled?: boolean;
  enabled?: boolean;
}

function shouldPersistPlaybackProgress(
  record: PlaybackRecord,
  parentArticle: Article | null,
  trackProgress: boolean,
): boolean {
  if (hasMeaningfulProgress(record.progress)) return true;
  if (parentArticle && record.chapterId) return true;
  if (record.mode !== "article" || !parentArticle || !record.chapterId) return false;
  if (!trackProgress) return true;
  const progress = record.progress as ProgressArticle | undefined;
  if (!progress) return true;
  return (progress.total ?? 0) > 0 || progress.offset === 0;
}

function shouldTrackScrollProgress(
  mode: string,
  contentRoot: HTMLElement | null,
): boolean {
  if (contentRoot?.dataset.novelStream === "true") return false;
  if (mode === "manga" || mode === "article") return true;
  return isComicContentRoot(contentRoot);
}

export function usePlaybackProgress({
  pluginMeta,
  channelId,
  recordChannelId,
  channelCapabilities,
  feedChannelId,
  feedChannelCapabilities,
  parentArticle,
  article,
  sessionId,
  contentRef,
  scrollRootRef,
  runtimeBase,
  contentReady = true,
  contentSurfaceKey = "article",
  novelChapterRecord,
  historyEnabled,
  enabled = true,
}: UsePlaybackProgressOptions): void {
  const config = useMemo(() => {
    if (parentArticle && feedChannelId) {
      return resolveChapterReadingPlayback(
        pluginMeta,
        channelId,
        feedChannelId,
        feedChannelCapabilities ?? channelCapabilities,
      );
    }
    return resolveEffectivePlayback(pluginMeta, channelId, channelCapabilities);
  }, [
    pluginMeta,
    channelId,
    channelCapabilities,
    feedChannelId,
    feedChannelCapabilities,
    parentArticle,
  ]);
  const historyActive = historyEnabled ?? config.history;
  const shouldClientSync = historyActive;

  const lastProgressKeyRef = useRef("");
  const lastProgressRef = useRef<PlaybackProgress | undefined>(undefined);
  const playbackEngagedRef = useRef(false);
  const articleRef = useRef(article);
  articleRef.current = article;
  const novelChapterRecordRef = useRef(novelChapterRecord);
  novelChapterRecordRef.current = novelChapterRecord;

  useEffect(() => {
    lastProgressRef.current = undefined;
    lastProgressKeyRef.current = "";
    playbackEngagedRef.current = false;
  }, [article?.id, parentArticle?.id]);

  useEffect(() => {
    if (!enabled || !config.progress) return;
    if (config.mode !== "video" && config.mode !== "audio") return;

    const root = contentRef.current;
    if (!root) return;

    const onPlay = (event: Event) => {
      if ((event.target as Element).closest("video, audio")) {
        playbackEngagedRef.current = true;
      }
    };

    root.addEventListener("play", onPlay, true);
    return () => root.removeEventListener("play", onPlay, true);
  }, [enabled, config.mode, config.progress, contentRef, article?.id]);

  const resolvedRecordChannelId = recordChannelId ?? channelId;

  const buildRecord = useCallback((): PlaybackRecord | null => {
    const currentArticle = articleRef.current;
    if (!currentArticle || !shouldClientSync) return null;

    const parentId = parentArticle?.id ?? currentArticle.id;
    const parentTitle = parentArticle?.title ?? currentArticle.title;
    const cover = parentArticle?.image ?? currentArticle.image;
    const root = contentRef.current;
    const scrollRoot = scrollRootRef?.current
      ?? (root ? findArticleScrollParent(root) : null);

    let chapterId = parentArticle ? currentArticle.id : undefined;
    let chapterTitle = parentArticle ? currentArticle.title : undefined;
    let progress: PlaybackProgress | undefined;
    const isComic = isComicContentRoot(root);
    const isNovelStream = root?.dataset.novelStream === "true";
    const progressMode = isComic ? "manga" : config.mode;

    if (isNovelStream && novelChapterRecordRef.current && parentArticle) {
      chapterId = novelChapterRecordRef.current.id;
      chapterTitle = novelChapterRecordRef.current.title;
    }

    if (config.progress) {
      switch (progressMode) {
        case "video":
        case "audio":
          progress = collectTimeProgress(sessionId, root);
          break;
        case "article":
          if (isNovelStream) {
            break;
          } else {
            progress = collectArticleScrollProgress(root, scrollRoot);
          }
          break;
        case "manga":
          if (root?.dataset.comicStream === "true") {
            const stream = collectMangaStreamProgress(root, scrollRoot);
            progress = stream.progress;
            if (stream.chapterId && parentArticle) {
              chapterId = stream.chapterId;
            }
          } else {
            progress = collectMangaPageProgress(root, scrollRoot);
          }
          break;
        default:
          break;
      }

      if (
        progressMode === "article"
        && parentArticle
        && chapterId
        && !isNovelStream
        && !hasMeaningfulProgress(progress)
        && (!progress || (progress as ProgressArticle).offset == null)
      ) {
        progress = { offset: 0, ...(progress as ProgressArticle) };
      }

      if (hasMeaningfulProgress(progress)) {
        lastProgressRef.current = progress;
        playbackEngagedRef.current = true;
      } else if (lastProgressRef.current) {
        progress = lastProgressRef.current;
      }
    }

    if (chapterId && parentArticle && root?.dataset.comicStream === "true") {
      const block = root.querySelector<HTMLElement>(`[data-comic-chapter="${chapterId}"]`);
      const title = block?.getAttribute("aria-label");
      if (title) {
        chapterTitle = title;
      } else if (chapterId === currentArticle.id) {
        chapterTitle = currentArticle.title;
      }
    }

    if (chapterId && parentArticle && root?.dataset.novelStream === "true") {
      const recordChapter = novelChapterRecordRef.current;
      if (recordChapter?.id === chapterId) {
        chapterTitle = recordChapter.title;
      } else {
        const block = root.querySelector<HTMLElement>(`[data-novel-chapter="${chapterId}"]`);
        const title = block?.getAttribute("aria-label");
        if (title) {
          chapterTitle = title;
        } else if (chapterId === currentArticle.id) {
          chapterTitle = currentArticle.title;
        }
      }
    }

    return {
      parentId,
      chapterId,
      channelId: resolvedRecordChannelId,
      parentTitle,
      chapterTitle,
      cover,
      mode: progressMode,
      progress,
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }, [
    resolvedRecordChannelId,
    shouldClientSync,
    config.mode,
    config.progress,
    contentRef,
    parentArticle,
    scrollRootRef,
    sessionId,
  ]);

  const flush = useCallback(async () => {
    const record = buildRecord();
    const pluginId = parentArticle?.pluginId
      ?? articleRef.current?.pluginId
      ?? pluginMeta?.id;
    if (!record || !pluginId) return;
    if (historyActive && !shouldPersistPlaybackProgress(record, parentArticle, config.progress)) return;
    if (
      config.progress
      && (config.mode === "video" || config.mode === "audio")
      && !playbackEngagedRef.current
    ) {
      return;
    }
    const progressKey = JSON.stringify({
      parentId: record.parentId,
      chapterId: record.chapterId,
      channelId: record.channelId,
      mode: record.mode,
      progress: record.progress,
    });
    if (progressKey === lastProgressKeyRef.current) return;
    lastProgressKeyRef.current = progressKey;
    try {
      await putPlayback(pluginId, record);
    } catch (err) {
      console.error("playback sync failed", err);
    }
  }, [buildRecord, config.mode, config.progress, historyActive, parentArticle, pluginMeta?.id]);

  const captureProgressSnapshot = useCallback(() => {
    if (!config.progress || !sessionId) return;
    if (config.mode === "video" || config.mode === "audio") {
      snapshotContentVideoProgress(sessionId, contentRef.current);
    }
  }, [config.mode, config.progress, contentRef, sessionId]);

  useEffect(() => {
    if (!enabled || !shouldClientSync) return;

    const interval = window.setInterval(() => {
      void flush();
    }, SYNC_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        captureProgressSnapshot();
        void flush();
      }
    };
    const onUnload = () => {
      captureProgressSnapshot();
      void flush();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onUnload);
      captureProgressSnapshot();
      void flush();
    };
  }, [
    enabled,
    shouldClientSync,
    captureProgressSnapshot,
    flush,
  ]);

  useEffect(() => {
    if (!enabled || !shouldClientSync) return;
    if (!config.progress && !parentArticle) return;

    const resolveScrollTargets = (): Array<HTMLElement | Window> => {
      const targets: Array<HTMLElement | Window> = [];
      const seen = new Set<EventTarget>();
      const add = (target: HTMLElement | Window | null | undefined) => {
        if (!target || seen.has(target)) return;
        seen.add(target);
        targets.push(target);
      };

      add(scrollRootRef?.current ?? null);
      const contentRoot = contentRef.current;
      add(contentRoot ? findArticleScrollParent(contentRoot) : null);
      if (targets.length === 0) add(window);
      return targets;
    };

    if (contentReady) {
      if (!shouldTrackScrollProgress(config.mode, contentRef.current)) return;
    } else if (config.mode !== "manga" && config.mode !== "article") {
      return;
    }

    let timer = 0;
    const onScroll = () => {
      const contentRoot = contentRef.current;
      if (!shouldTrackScrollProgress(config.mode, contentRoot)) return;

      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (contentRoot && isComicContentRoot(contentRoot)) {
          if (contentRoot.dataset.comicStream === "true") {
            syncComicStreamVisibleChapterImages(
              contentRoot,
              scrollRootRef?.current ?? null,
              { runtimeBase },
            );
          } else {
            syncComicLazyImages(contentRoot, scrollRootRef?.current ?? null, { runtimeBase });
          }
        }
        void flush();
      }, 400);
    };

    const targets = resolveScrollTargets();
    for (const target of targets) {
      target.addEventListener("scroll", onScroll, { passive: true });
    }

    return () => {
      for (const target of targets) {
        target.removeEventListener("scroll", onScroll);
      }
      window.clearTimeout(timer);
    };
  }, [
    enabled,
    shouldClientSync,
    config.progress,
    config.mode,
    contentRef,
    scrollRootRef,
    runtimeBase,
    contentReady,
    contentSurfaceKey,
    flush,
    article?.id,
    parentArticle?.id,
  ]);

  useEffect(() => {
    if (!enabled || !shouldClientSync || !novelChapterRecord?.id) return;
    void flush();
  }, [
    enabled,
    shouldClientSync,
    novelChapterRecord?.id,
    flush,
  ]);

  useEffect(() => {
    if (!enabled || !shouldClientSync || !article?.id) return;
    void flush();
  }, [
    enabled,
    shouldClientSync,
    article?.id,
    parentArticle?.id,
    resolvedRecordChannelId,
    flush,
  ]);

  useEffect(() => {
    if (!enabled || !shouldClientSync) return;
    if (!article?.id || !contentReady) return;

    const root = contentRef.current;
    if (!shouldTrackScrollProgress(config.mode, root)) return;

    const raf = window.requestAnimationFrame(() => {
      void flush();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [
    enabled,
    shouldClientSync,
    config.mode,
    article?.id,
    contentReady,
    contentSurfaceKey,
    contentRef,
    flush,
  ]);
}
