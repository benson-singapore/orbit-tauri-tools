import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { articleContentTheme, isDarkTheme } from "@/lib/themeMode";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { ProxiedImage } from "@/components/ProxiedImage";
import { useVideoSessionMountRegistry } from "@/components/VideoWallMountContext";
import {
  dedupeCoverImageFromContent,
  prepareArticleHtmlContent,
} from "@/lib/articleContent";
import { stripEmbeddedVideosFromContent } from "@/lib/articleVideoUrl";
import {
  resolveArticleDetailChannel,
  resolveArticleHasDetail,
  shouldSkipFeedItemDetailFetch,
  isRatingPluginArticle,
} from "@/lib/browseDynamicFeed";
import { highlightArticleCode } from "@/lib/highlightArticleCode";
import { fetchFeedItem } from "@/lib/feed";
import { bindArticleContentImages } from "@/lib/imageProxy";
import {
  bindArticleContentPlayers,
  destroyArticleContentPlayers,
} from "@/lib/articleContentPlayer";
import { runtimeOpenDetail, shouldUseRuntimeV2 } from "@/lib/runtimeV2";
import { ChaptersDrawer } from "@/components/ChaptersDrawer";
import { ChaptersList } from "@/components/ChaptersList";
import { ChaptersOpenButton } from "@/components/ChaptersOpenButton";
import { ArticleRatingHero, shouldShowArticleRatingHero } from "@/components/ArticleRatingHero";
import { useArticleChapters, shouldOpenChaptersForArticle } from "@/hooks/useArticleChapters";
import { usePlaybackProgress } from "@/hooks/usePlaybackProgress";
import { usesDedicatedSessionVideoPlayer, promoteArticleForSessionVideo } from "@/lib/readerSessionVideos";
import { applyPlaybackResume, fetchResumeIntentForArticle, seedPlaybackResumeSnapshot } from "@/lib/playbackResume";
import { resolveEffectivePlayback } from "@/lib/playbackConfig";
import type { PlaybackResumeIntent } from "@/types";
import { resolveYouTubeVideoId } from "@/lib/youtube";
import { snapshotContentVideoProgress } from "@/lib/sessionVideoProgress";
import type { ReaderSessionMode } from "@/lib/readerSessions";
import type { Article, ChannelCapabilities, Plugin, ThemeMode } from "@/types";

interface ArticleReaderModalProps {
  sessionId: string;
  theme: ThemeMode;
  runtimeBase: string | null;
  article: Article;
  readerFontScale: number;
  hasDetail: boolean;
  activeChannel: string;
  pluginMeta?: Plugin;
  channelCapabilities: ChannelCapabilities;
  storedChannel?: string | null;
  mode: ReaderSessionMode;
  autoDockOnDismiss: boolean;
  inVideoWall: boolean;
  onClose: () => void;
  onDock: () => void;
  onArticleChange?: (article: Article) => void;
  resumeIntent?: PlaybackResumeIntent;
  onResumeApplied?: () => void;
}

export function ArticleReaderModal({
  sessionId,
  theme,
  runtimeBase,
  article: initialArticle,
  readerFontScale,
  hasDetail,
  activeChannel,
  pluginMeta,
  channelCapabilities,
  storedChannel,
  mode,
  autoDockOnDismiss,
  inVideoWall,
  onClose,
  onDock,
  onArticleChange,
  resumeIntent,
  onResumeApplied,
}: ArticleReaderModalProps) {
  const isExpanded = mode === "expanded";
  const isDark = isDarkTheme(theme);
  const panelBg = isDark ? "bg-[#141416] text-white" : "bg-white text-neutral-900";
  const [article, setArticle] = useState(initialArticle);
  const [loading, setLoading] = useState(false);
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const [chaptersDrawerOpen, setChaptersDrawerOpen] = useState(false);
  const [chaptersParent] = useState<Article | null>(() =>
    shouldOpenChaptersForArticle(
      initialArticle,
      pluginMeta,
      activeChannel,
      channelCapabilities,
      storedChannel,
    )
      ? initialArticle
      : null,
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const onArticleChangeRef = useRef(onArticleChange);
  onArticleChangeRef.current = onArticleChange;

  const syncArticleToSession = useCallback((next: Article) => {
    onArticleChangeRef.current?.(next);
  }, []);

  const channelId = resolveArticleDetailChannel(article, pluginMeta, activeChannel);
  const effectiveHasDetail = resolveArticleHasDetail(
    article,
    pluginMeta,
    activeChannel,
    { hasDetail },
  );
  const hasChaptersMode = Boolean(chaptersParent);
  const resumeAppliedRef = useRef(false);
  const [resolvedResumeIntent, setResolvedResumeIntent] = useState(resumeIntent);

  useEffect(() => {
    setResolvedResumeIntent(resumeIntent);
  }, [resumeIntent]);

  useEffect(() => {
    if (resumeIntent?.progress) return;

    let cancelled = false;
    const parentId = chaptersParent?.id ?? article.id;
    void fetchResumeIntentForArticle(article.pluginId, parentId, channelId).then(intent => {
      if (!cancelled && intent) {
        setResolvedResumeIntent(intent);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    article.id,
    article.pluginId,
    channelId,
    chaptersParent?.id,
    resumeIntent?.progress,
  ]);

  useEffect(() => {
    resumeAppliedRef.current = false;
  }, [sessionId, resolvedResumeIntent?.chapterId, resolvedResumeIntent?.progress]);

  useEffect(() => {
    seedPlaybackResumeSnapshot(sessionId, resolvedResumeIntent?.progress, resolvedResumeIntent?.mode);
  }, [sessionId, resolvedResumeIntent?.progress, resolvedResumeIntent?.mode]);

  const chapters = useArticleChapters({
    parent: chaptersParent,
    activeChannel,
    pluginMeta,
    capabilities: channelCapabilities,
    storedChannel,
    enabled: hasChaptersMode,
    initialChapterId: resolvedResumeIntent?.chapterId,
    onChapterDetail: next => {
      setArticle(next);
      syncArticleToSession(next);
    },
    onChapterDetailLoaded: () => {
      resumeAppliedRef.current = false;
    },
  });

  usePlaybackProgress({
    pluginMeta,
    channelId,
    channelCapabilities,
    parentArticle: chaptersParent,
    article,
    sessionId,
    contentRef,
    enabled: isExpanded,
  });

  useEffect(() => {
    if (hasChaptersMode) return;
    setArticle(initialArticle);
    setCoverImageFailed(false);
    setChaptersDrawerOpen(false);
  }, [initialArticle, hasChaptersMode]);

  useEffect(() => {
    if (!isExpanded) {
      setLoading(false);
      return;
    }

    if (hasChaptersMode) {
      setLoading(false);
      return;
    }

    const itemId = article.id;
    if (shouldSkipFeedItemDetailFetch(article, pluginMeta, effectiveHasDetail)) {
      setLoading(false);
      return;
    }

    if (shouldUseRuntimeV2(article.pluginId, pluginMeta) && channelId !== "all" && effectiveHasDetail) {
      let cancelled = false;
      setLoading(true);
      void runtimeOpenDetail(article.pluginId, channelId, itemId)
        .then(result => {
          if (cancelled || !result.item) return;
          setArticle(prev => {
            if (prev.id !== itemId) return prev;
            const next = { ...prev, ...result.item };
            syncArticleToSession(next);
            return next;
          });
        })
        .catch(err => {
          if (!cancelled) console.error("load article content failed", err);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    if (shouldUseRuntimeV2(article.pluginId, pluginMeta)) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetchFeedItem(itemId, {
      pluginId: article.pluginId,
      channelId,
    })
      .then(detail => {
        if (cancelled) return;
        setArticle(prev => {
          if (prev.id !== itemId) return prev;
          const next = { ...prev, ...detail };
          syncArticleToSession(next);
          return next;
        });
      })
      .catch(err => {
        if (!cancelled) console.error("load article content failed", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isExpanded, article.id, pluginMeta, effectiveHasDetail, channelId, syncArticleToSession, hasChaptersMode]);

  const isRatingCoverLayout = isRatingPluginArticle(article, pluginMeta);

  const showContentLoading = loading
    || chapters.detailLoading
    || (chapters.isActive && chapters.loading);

  const showArticleMedia = useMemo(() => {
    if (article.type === "text") {
      return Boolean(article.image?.trim()) && !coverImageFailed;
    }
    if (article.type === "video") {
      return Boolean(resolveYouTubeVideoId(article) || article.videoUrl?.trim());
    }
    if (article.type === "audio") {
      return true;
    }
    if (article.type === "image") {
      if (article.galleryImages?.length) {
        return true;
      }
      return Boolean(article.image?.trim()) && !coverImageFailed;
    }
    return false;
  }, [article, coverImageFailed]);

  const hasSessionVideoMedia = usesDedicatedSessionVideoPlayer(article);
  const { registerMount } = useVideoSessionMountRegistry();

  const modalMountRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (hasSessionVideoMedia) {
        registerMount(sessionId, "modal", element);
        return;
      }
      registerMount(sessionId, "modal", null);
    },
    [registerMount, sessionId, hasSessionVideoMedia],
  );

  const displayContent = useMemo(() => {
    if (!article.content?.trim()) return "";
    let content = article.content;
    if (article.type === "text" && article.image) {
      content = dedupeCoverImageFromContent(article.image, content);
    }
    if (hasSessionVideoMedia) {
      content = stripEmbeddedVideosFromContent(content);
    }
    return prepareArticleHtmlContent(content, runtimeBase, {
      darkTheme: isDarkTheme(theme),
    });
  }, [article.content, article.image, article.type, runtimeBase, hasSessionVideoMedia, theme]);

  useEffect(() => {
    if (!displayContent) return;

    highlightArticleCode(contentRef.current);
    bindArticleContentImages(contentRef.current, runtimeBase);
    bindArticleContentPlayers(contentRef.current, { sessionId });

    if (
      isExpanded
      && !hasSessionVideoMedia
      && resolvedResumeIntent?.progress
      && !resumeAppliedRef.current
      && !showContentLoading
    ) {
      resumeAppliedRef.current = true;
      const mode = resolvedResumeIntent.mode ?? resolveEffectivePlayback(pluginMeta, channelId, channelCapabilities).mode;
      window.requestAnimationFrame(() => {
        applyPlaybackResume(mode, resolvedResumeIntent.progress, {
          sessionId,
          contentRoot: contentRef.current,
        });
        onResumeApplied?.();
      });
    }

    return () => destroyArticleContentPlayers(contentRef.current);
  }, [
    displayContent,
    runtimeBase,
    theme,
    sessionId,
    isExpanded,
    hasSessionVideoMedia,
    resolvedResumeIntent,
    showContentLoading,
    pluginMeta,
    channelId,
    channelCapabilities,
    onResumeApplied,
  ]);

  useEffect(() => {
    if (!isExpanded || !hasSessionVideoMedia || !resolvedResumeIntent?.progress || resumeAppliedRef.current) return;
    if (showContentLoading) return;

    resumeAppliedRef.current = true;
    const mode = resolvedResumeIntent.mode ?? resolveEffectivePlayback(pluginMeta, channelId, channelCapabilities).mode;
    window.requestAnimationFrame(() => {
      applyPlaybackResume(mode, resolvedResumeIntent.progress, {
        sessionId,
        contentRoot: contentRef.current,
      });
      onResumeApplied?.();
    });
  }, [
    isExpanded,
    hasSessionVideoMedia,
    resolvedResumeIntent,
    showContentLoading,
    pluginMeta,
    channelId,
    channelCapabilities,
    sessionId,
    onResumeApplied,
  ]);

  const handleDock = useCallback(() => {
    snapshotContentVideoProgress(sessionId, contentRef.current);
    const promoted = promoteArticleForSessionVideo(article, contentRef.current);
    if (promoted.videoUrl !== article.videoUrl) {
      setArticle(promoted);
      syncArticleToSession(promoted);
    }
    onDock();
  }, [sessionId, onDock, article, syncArticleToSession]);

  useEffect(() => {
    if (!isExpanded) return;
    syncArticleToSession(article);
    // Sync list metadata when a session opens; detail fetch performs another sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, article.id, syncArticleToSession]);

  useEffect(() => {
    if (!isExpanded) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (chaptersDrawerOpen) {
          setChaptersDrawerOpen(false);
          return;
        }
        handleDock();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isExpanded, handleDock, chaptersDrawerOpen]);

  useEffect(() => {
    if (!isExpanded) return;

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isExpanded]);

  const handleBackdropClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (autoDockOnDismiss) {
      handleDock();
      return;
    }
    onClose();
  };

  const headerButtonClass = isDark
    ? "bg-black/40 hover:bg-black/60 text-white/80"
    : "bg-black/20 hover:bg-black/30 text-neutral-600";

  const showRatingHero = shouldShowArticleRatingHero(article, {
    isRatingLayout: isRatingCoverLayout,
    showArticleMedia,
    coverImageFailed,
  });

  const toggleChaptersDrawer = () => setChaptersDrawerOpen(open => !open);

  const chaptersOpenButton = chapters.isActive ? (
    <ChaptersOpenButton
      theme={theme}
      open={chaptersDrawerOpen}
      onClick={toggleChaptersDrawer}
    />
  ) : null;

  const chaptersList = chapters.isActive && chaptersParent ? (
    <ChaptersList
      theme={theme}
      variant="sidebar"
      title={chapters.title}
      items={chapters.items}
      loading={chapters.loading}
      loadingMore={chapters.loadingMore}
      refreshing={chapters.refreshing}
      hasMore={chapters.hasMore}
      canLoadMore={channelCapabilities.canLoadMoreChapters}
      canRefresh={channelCapabilities.canRefreshChapters || channelCapabilities.hasChapters}
      parentItem={chaptersParent}
      activeItemId={chapters.activeChapter?.id ?? article.id}
      itemLabel={channelCapabilities.chaptersItemLabel}
      onSelect={chapter => {
        setChaptersDrawerOpen(false);
        void chapters.selectChapter(chapter);
      }}
      onLoadMore={chapters.loadMore}
      onRefresh={chapters.refresh}
      onClearAndRefresh={chapters.clearAndRefresh}
    />
  ) : null;

  const modal = (
    <div
      className={
        isExpanded
          ? "fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm"
          : "fixed -left-[9999px] top-0 w-full max-w-4xl h-[90vh] opacity-0 pointer-events-none overflow-hidden"
      }
      onClick={isExpanded ? handleBackdropClick : undefined}
      aria-hidden={!isExpanded}
    >
      <div
        className={`relative w-full max-w-4xl h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${panelBg}`}
        onClick={event => event.stopPropagation()}
        role={isExpanded ? "dialog" : undefined}
        aria-modal={isExpanded ? true : undefined}
        aria-labelledby={isExpanded ? "article-reader-modal-title" : undefined}
      >
        {isExpanded ? (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                handleDock();
              }}
              className={`p-2 rounded-full transition-colors ${headerButtonClass}`}
              aria-label="挂起到侧栏"
              title="挂起到侧栏 (Esc)"
            >
              <Icon name="expand" className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                onClose();
              }}
              className={`p-2 rounded-full transition-colors ${headerButtonClass}`}
              aria-label="关闭"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>
        ) : null}

        <div
          className="flex-1 min-h-0 overflow-y-auto article-reader px-5 sm:px-8 py-6 sm:py-8"
          style={{ "--reader-scale": readerFontScale } as React.CSSProperties}
        >
          <div className="space-y-6">
            {showRatingHero ? (
              <div className={isExpanded ? "pr-20" : "pr-8"}>
                <ArticleRatingHero
                  article={article}
                  theme={theme}
                  runtimeBase={runtimeBase}
                  trailing={chaptersOpenButton}
                  onCoverError={() => setCoverImageFailed(true)}
                />
              </div>
            ) : null}

            <div className="space-y-4">
              {!showRatingHero ? (
                <div className={`flex items-start gap-3 ${isExpanded ? "pr-20" : "pr-8"}`}>
                  <h2
                    id="article-reader-modal-title"
                    className="article-reader-title font-extrabold tracking-tight leading-tight flex-1 min-w-0"
                  >
                    {article.title}
                  </h2>
                  {chaptersOpenButton}
                </div>
              ) : null}

            {showArticleMedia
              && !showRatingHero
              && article.type === "image"
              && article.image?.trim()
              && !article.galleryImages?.length ? (
              <ProxiedImage
                runtimeBase={runtimeBase}
                src={article.image}
                alt={article.title}
                className="rounded-xl"
                onError={() => setCoverImageFailed(true)}
              />
            ) : showArticleMedia && !showRatingHero ? (
              <div className="w-full rounded-2xl overflow-hidden shadow-md bg-neutral-100 dark:bg-neutral-900">
                {article.type === "text" && article.image?.trim() ? (
                  <ProxiedImage
                    runtimeBase={runtimeBase}
                    src={article.image}
                    alt="Article Cover"
                    className="w-auto h-auto max-w-full mx-auto block"
                    onError={() => setCoverImageFailed(true)}
                  />
                ) : null}

                {hasSessionVideoMedia ? (
                  <div
                    ref={modalMountRef}
                    className={
                      inVideoWall
                        ? "fixed -left-[9999px] top-0 w-[640px] aspect-video opacity-0 pointer-events-none overflow-hidden"
                        : "relative aspect-video bg-neutral-950 w-full"
                    }
                    aria-hidden={inVideoWall}
                  />
                ) : null}

                {article.type === "audio" && article.image ? (
                  <ProxiedImage
                    runtimeBase={runtimeBase}
                    src={article.image}
                    alt={article.title}
                    className="w-full max-h-64 object-cover"
                  />
                ) : null}
              </div>
            ) : null}

            {!showRatingHero && (article.tags ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(article.tags ?? []).map((tag, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}

            {showContentLoading ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-neutral-400">
                <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
                加载正文中…
              </div>
            ) : displayContent ? (
              <>
                <div
                  ref={contentRef}
                  data-theme={articleContentTheme(theme)}
                  className="article-content mt-6"
                  dangerouslySetInnerHTML={{ __html: displayContent }}
                />
                {article.sourceUrl ? (
                  <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <a
                      href={article.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:underline dark:text-indigo-400"
                    >
                      阅读原文 →
                    </a>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-6 border-t border-dashed dark:border-neutral-800 pt-6 space-y-4">
                {article.summary?.trim() ? (
                  <p className="text-base text-neutral-600 dark:text-neutral-400 leading-relaxed italic">
                    “ {article.summary} ”
                  </p>
                ) : null}
                {article.sourceUrl ? (
                  <a
                    href={article.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-sm text-indigo-500 hover:underline"
                  >
                    阅读原文 →
                  </a>
                ) : (
                  <p className="text-sm text-neutral-400">
                    （这是一个带有交互式卡片的媒体项目资源，详情请在正文中直接点击交互并体验。）
                  </p>
                )}
              </div>
            )}
          </div>
          </div>
        </div>

        <ChaptersDrawer
          open={chaptersDrawerOpen}
          theme={theme}
          title={chapters.title || "选集"}
          elevated
          onClose={() => setChaptersDrawerOpen(false)}
        >
          {chaptersList}
        </ChaptersDrawer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
