import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { putPlayback } from "@/lib/playback";
import { resolveEffectivePlayback } from "@/lib/playbackConfig";
import { syncComicLazyImages } from "@/lib/comicChapterContent";
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
import type { Article, ChannelCapabilities, PlaybackProgress, PlaybackRecord, Plugin } from "@/types";

const SYNC_INTERVAL_MS = 5000;

export interface UsePlaybackProgressOptions {
  pluginMeta?: Plugin;
  channelId: string;
  channelCapabilities?: Pick<ChannelCapabilities, "playback">;
  parentArticle: Article | null;
  article: Article | null;
  sessionId?: string;
  contentRef: RefObject<HTMLElement | null>;
  scrollRootRef?: RefObject<HTMLElement | null>;
  /** True once article HTML is mounted (not loading). Re-binds scroll tracking. */
  contentReady?: boolean;
  enabled?: boolean;
}

function shouldTrackScrollProgress(
  mode: string,
  contentRoot: HTMLElement | null,
): boolean {
  if (mode === "manga" || mode === "article") return true;
  return isComicContentRoot(contentRoot);
}

export function usePlaybackProgress({
  pluginMeta,
  channelId,
  channelCapabilities,
  parentArticle,
  article,
  sessionId,
  contentRef,
  scrollRootRef,
  contentReady = true,
  enabled = true,
}: UsePlaybackProgressOptions): void {
  const config = useMemo(
    () => resolveEffectivePlayback(pluginMeta, channelId, channelCapabilities),
    [pluginMeta, channelId, channelCapabilities],
  );
  const lastProgressKeyRef = useRef("");
  const lastProgressRef = useRef<PlaybackProgress | undefined>(undefined);
  const playbackEngagedRef = useRef(false);
  const articleRef = useRef(article);
  articleRef.current = article;

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

  const buildRecord = useCallback((): PlaybackRecord | null => {
    const currentArticle = articleRef.current;
    if (!currentArticle || !config.history || config.managedBy !== "runtime") return null;

    const parentId = parentArticle?.id ?? currentArticle.id;
    const parentTitle = parentArticle?.title ?? currentArticle.title;
    const cover = parentArticle?.image ?? currentArticle.image;
    const scrollRoot = scrollRootRef?.current ?? null;
    const root = contentRef.current;

    let chapterId = parentArticle ? currentArticle.id : undefined;
    let chapterTitle = parentArticle ? currentArticle.title : undefined;
    let progress: PlaybackProgress | undefined;
    const isComic = isComicContentRoot(root);
    const progressMode = isComic ? "manga" : config.mode;

    if (config.progress) {
      switch (progressMode) {
        case "video":
        case "audio":
          progress = collectTimeProgress(sessionId, root);
          break;
        case "article":
          progress = collectArticleScrollProgress(root);
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

    return {
      parentId,
      chapterId,
      channelId,
      parentTitle,
      chapterTitle,
      cover,
      mode: progressMode,
      progress,
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }, [
    channelId,
    config.history,
    config.managedBy,
    config.mode,
    config.progress,
    contentRef,
    parentArticle,
    scrollRootRef,
    sessionId,
  ]);

  const flush = useCallback(async () => {
    const record = buildRecord();
    const pluginId = articleRef.current?.pluginId ?? parentArticle?.pluginId;
    if (!record || !pluginId) return;
    if (config.progress && !hasMeaningfulProgress(record.progress)) return;
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
  }, [buildRecord, config.mode, config.progress, parentArticle?.pluginId]);

  const captureProgressSnapshot = useCallback(() => {
    if (!config.progress || !sessionId) return;
    if (config.mode === "video" || config.mode === "audio") {
      snapshotContentVideoProgress(sessionId, contentRef.current);
    }
  }, [config.mode, config.progress, contentRef, sessionId]);

  useEffect(() => {
    if (!enabled || !config.history || config.managedBy !== "runtime") return;

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
    config.history,
    config.managedBy,
    captureProgressSnapshot,
    flush,
  ]);

  useEffect(() => {
    if (!enabled || !config.progress || !config.history || config.managedBy !== "runtime") return;

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
          syncComicLazyImages(contentRoot, scrollRootRef?.current ?? null);
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
    config.progress,
    config.history,
    config.managedBy,
    config.mode,
    contentRef,
    scrollRootRef,
    contentReady,
    flush,
    article?.id,
  ]);

  useEffect(() => {
    if (!enabled || !config.history || config.managedBy !== "runtime") return;
    if (!article?.id || !contentReady) return;

    const root = contentRef.current;
    if (!shouldTrackScrollProgress(config.mode, root)) return;

    const raf = window.requestAnimationFrame(() => {
      void flush();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [
    enabled,
    config.history,
    config.managedBy,
    config.mode,
    article?.id,
    contentReady,
    contentRef,
    flush,
  ]);
}
