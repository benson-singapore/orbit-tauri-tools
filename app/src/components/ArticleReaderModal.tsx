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
import { syncComicReaderImages } from "@/lib/comicChapterContent";
import { comicPageWidthCssValue } from "@/lib/comicPageWidth";
import {
  bindArticleContentPlayers,
  destroyArticleContentPlayers,
} from "@/lib/articleContentPlayer";
import { runtimeOpenDetail, shouldUseRuntimeV2 } from "@/lib/runtimeV2";
import { ChaptersDrawer } from "@/components/ChaptersDrawer";
import { ChaptersList } from "@/components/ChaptersList";
import { ChaptersOpenButton } from "@/components/ChaptersOpenButton";
import { ComicPageWidthSlider } from "@/components/ComicPageWidthSlider";
import { ArticleRatingHero, shouldShowArticleRatingHero } from "@/components/ArticleRatingHero";
import { useArticleChapters, shouldOpenChaptersForArticle } from "@/hooks/useArticleChapters";
import { usePlaybackProgress } from "@/hooks/usePlaybackProgress";
import { usesDedicatedSessionVideoPlayer, promoteArticleForSessionVideo } from "@/lib/readerSessionVideos";
import {
  applyPlaybackResume,
  collectArticleScrollProgress,
  collectMangaPageProgress,
  collectTimeProgress,
  fetchResumeIntentForArticle,
  hasMeaningfulProgress,
  seedPlaybackResumeSnapshot,
} from "@/lib/playbackResume";
import { resolveEffectivePlayback } from "@/lib/playbackConfig";
import type { PlaybackResumeIntent, PlaybackProgress } from "@/types";
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
  comicPageWidth?: number;
  onComicPageWidthChange?: (width: number) => void;
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
  pageDetailSwitchEnabled?: boolean;
  onSwitchToPageDetail?: (payload: {
    openArticle: Article;
    resumeIntent?: PlaybackResumeIntent;
  }) => void;
}

export function ArticleReaderModal({
  sessionId,
  theme,
  runtimeBase,
  article: initialArticle,
  readerFontScale,
  comicPageWidth = 100,
  onComicPageWidthChange,
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
  pageDetailSwitchEnabled = false,
  onSwitchToPageDetail,
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
  const scrollRootRef = useRef<HTMLDivElement>(null);
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

  const isComicReaderContent = useMemo(
    () => displayContent.includes("comic-reader"),
    [displayContent],
  );

  const showContentLoading = loading
    || chapters.detailLoading
    || (chapters.isActive && chapters.loading);

  usePlaybackProgress({
    pluginMeta,
    channelId,
    channelCapabilities,
    parentArticle: chaptersParent,
    article,
    sessionId,
    contentRef,
    scrollRootRef,
    contentReady: Boolean(displayContent) && !showContentLoading,
    enabled: isExpanded,
  });

  useEffect(() => {
    if (!displayContent || !contentRef.current) return;

    const contentRoot = contentRef.current;
    highlightArticleCode(contentRoot);
    if (isComicReaderContent) {
      syncComicReaderImages(contentRoot, scrollRootRef.current, { runtimeBase });
    }
    bindArticleContentImages(contentRoot, runtimeBase);
    bindArticleContentPlayers(contentRoot, { sessionId });

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
          contentRoot,
          scrollRoot: scrollRootRef.current,
          chapterId: resolvedResumeIntent.chapterId,
        });
        onResumeApplied?.();
      });
    }

    return () => destroyArticleContentPlayers(contentRoot);
  }, [
    displayContent,
    isComicReaderContent,
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

  const buildPageDetailResumeIntent = useCallback((): PlaybackResumeIntent | undefined => {
    const mode = resolveEffectivePlayback(pluginMeta, channelId, channelCapabilities).mode;
    let progress: PlaybackProgress | undefined;
    const root = contentRef.current;
    if (root) {
      switch (mode) {
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
    }

    const effectiveProgress = hasMeaningfulProgress(progress)
      ? progress
      : resolvedResumeIntent?.progress;

    if (!effectiveProgress && !chaptersParent) {
      return resolvedResumeIntent;
    }

    return {
      chapterId: chaptersParent ? article.id : resolvedResumeIntent?.chapterId,
      progress: effectiveProgress,
      mode: resolvedResumeIntent?.mode ?? mode,
    };
  }, [
    article.id,
    channelCapabilities,
    channelId,
    chaptersParent,
    pluginMeta,
    resolvedResumeIntent,
    sessionId,
  ]);

  const handleSwitchToPageDetail = useCallback(() => {
    if (!onSwitchToPageDetail) return;
    onSwitchToPageDetail({
      openArticle: chaptersParent ?? article,
      resumeIntent: buildPageDetailResumeIntent(),
    });
  }, [article, buildPageDetailResumeIntent, chaptersParent, onSwitchToPageDetail]);

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
        scrollRootRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        void chapters.selectChapter(chapter);
      }}
      onLoadMore={chapters.loadMore}
      onRefresh={chapters.refresh}
      onClearAndRefresh={chapters.clearAndRefresh}
    />
  ) : null;

  const chapterPager = useMemo(() => {
    if (!chapters.isActive || !isComicReaderContent) return null;
    const activeId = chapters.activeChapter?.id ?? null;
    if (!activeId) return null;
    const idx = chapters.items.findIndex(item => item.id === activeId);
    if (idx < 0) return null;
    const prev = idx > 0 ? chapters.items[idx - 1] : null;
    const next = idx < chapters.items.length - 1 ? chapters.items[idx + 1] : null;
    if (!prev && !next) return null;

    return (
      <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-3">
          {prev ? (
            <button
              type="button"
              onClick={() => {
                scrollRootRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                void chapters.selectChapter(prev);
              }}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              title={`上一话：${prev.title}`}
            >
              上一话
            </button>
          ) : (
            <span />
          )}

          {next ? (
            <button
              type="button"
              onClick={() => {
                scrollRootRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                void chapters.selectChapter(next);
              }}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              title={`下一话：${next.title}`}
            >
              下一话
            </button>
          ) : null}
        </div>
      </div>
    );
  }, [chapters, isComicReaderContent]);

  const introStartReading = useMemo(() => {
    if (!chapters.isActive || pluginMeta?.mediaType !== "manga" || isComicReaderContent) return null;
    const activeId = chapters.activeChapter?.id ?? null;
    if (!activeId) return null;
    const idx = chapters.items.findIndex(item => item.id === activeId);
    if (idx < 0) return null;
    const next = idx < chapters.items.length - 1 ? chapters.items[idx + 1] : null;
    if (!next) return null;

    return (
      <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800 flex justify-center">
        <button
          type="button"
          onClick={() => {
            scrollRootRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            void chapters.selectChapter(next);
          }}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
          title={`开始阅读：${next.title}`}
        >
          开始阅读
          <Icon name="arrow-left" className="w-4 h-4 rotate-180" />
        </button>
      </div>
    );
  }, [chapters, isComicReaderContent, pluginMeta?.mediaType]);

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
            {isComicReaderContent && onComicPageWidthChange ? (
              <div className={`rounded-full px-2 py-1 ${isDark ? "bg-black/40" : "bg-black/10"}`}>
                <ComicPageWidthSlider
                  theme={theme}
                  value={comicPageWidth}
                  onChange={onComicPageWidthChange}
                />
              </div>
            ) : null}
            {chaptersOpenButton}
            {pageDetailSwitchEnabled ? (
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  handleSwitchToPageDetail();
                }}
                className={`p-2 rounded-full transition-colors ${headerButtonClass}`}
                aria-label="切换到页面详情"
                title="切换到页面详情"
              >
                <Icon name="maximize" className="w-4 h-4" />
              </button>
            ) : null}
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
          ref={scrollRootRef}
          className="flex-1 min-h-0 overflow-y-auto article-reader px-5 sm:px-8 py-6 sm:py-8"
          style={{
            "--reader-scale": readerFontScale,
            "--comic-page-width": comicPageWidthCssValue(comicPageWidth),
          } as React.CSSProperties}
        >
          <div className="space-y-6">
            {showRatingHero ? (
              <div className={isExpanded ? "pr-20" : "pr-8"}>
                <ArticleRatingHero
                  article={article}
                  theme={theme}
                  runtimeBase={runtimeBase}
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
                </div>
              ) : null}

            {showArticleMedia && !showRatingHero && (article.type === "video" || article.type === "audio") ? (
              <div className="w-full rounded-2xl overflow-hidden shadow-md bg-neutral-100 dark:bg-neutral-900">
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
                {introStartReading}
                {chapterPager}
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
