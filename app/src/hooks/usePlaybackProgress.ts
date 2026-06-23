import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { putPlayback } from "@/lib/playback";
import { resolveEffectivePlayback } from "@/lib/playbackConfig";
import {
  collectArticleScrollProgress,
  collectMangaPageProgress,
  collectTimeProgress,
  hasMeaningfulProgress,
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
  enabled?: boolean;
}

export function usePlaybackProgress({
  pluginMeta,
  channelId,
  channelCapabilities,
  parentArticle,
  article,
  sessionId,
  contentRef,
  enabled = true,
}: UsePlaybackProgressOptions): void {
  const config = useMemo(
    () => resolveEffectivePlayback(pluginMeta, channelId, channelCapabilities),
    [pluginMeta, channelId, channelCapabilities],
  );
  const lastPayloadRef = useRef("");
  const lastProgressRef = useRef<PlaybackProgress | undefined>(undefined);
  const playbackEngagedRef = useRef(false);

  useEffect(() => {
    lastProgressRef.current = undefined;
    lastPayloadRef.current = "";
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
    if (!article || !config.history || config.managedBy !== "runtime") return null;

    const parentId = parentArticle?.id ?? article.id;
    const parentTitle = parentArticle?.title ?? article.title;
    const chapterId = parentArticle ? article.id : undefined;
    const chapterTitle = parentArticle ? article.title : undefined;
    const cover = parentArticle?.image ?? article.image;

    let progress: PlaybackProgress | undefined;
    if (config.progress) {
      const root = contentRef.current;
      switch (config.mode) {
        case "video":
        case "audio":
          progress = collectTimeProgress(sessionId, root);
          break;
        case "article":
          progress = collectArticleScrollProgress(root);
          break;
        case "manga":
          progress = collectMangaPageProgress(root);
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

    return {
      parentId,
      chapterId,
      channelId,
      parentTitle,
      chapterTitle,
      cover,
      mode: config.mode,
      progress,
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }, [
    article?.id,
    article?.image,
    article?.title,
    channelId,
    config.history,
    config.managedBy,
    config.mode,
    config.progress,
    contentRef,
    parentArticle,
    sessionId,
  ]);

  const flush = useCallback(async () => {
    const record = buildRecord();
    if (!record || !article?.pluginId) return;
    if (config.progress && !hasMeaningfulProgress(record.progress)) return;
    if (
      config.progress
      && (config.mode === "video" || config.mode === "audio")
      && !playbackEngagedRef.current
    ) {
      return;
    }
    const payload = JSON.stringify(record);
    if (payload === lastPayloadRef.current) return;
    lastPayloadRef.current = payload;
    try {
      await putPlayback(article.pluginId, record);
    } catch (err) {
      console.error("playback sync failed", err);
    }
  }, [article?.pluginId, buildRecord, config.mode, config.progress]);

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
}
