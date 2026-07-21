import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { articleContentTheme } from "@/lib/themeMode";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { ReaderAudioPlayer } from "@/components/ReaderAudioPlayer";
import { useVideoSessionMountRegistry } from "@/components/VideoWallMountContext";
import { stripEmbeddedVideosFromContent } from "@/lib/articleVideoUrl";
import {
  resolveArticleDetailChannel,
  resolveArticleHasDetail,
  shouldSkipFeedItemDetailFetch,
  isRatingPluginArticle,
} from "@/lib/browseDynamicFeed";
import { isSocialPlugin } from "@/lib/socialPlugin";
import { SocialNoteDetail } from "@/components/SocialNoteDetail";
import { highlightArticleCode } from "@/lib/highlightArticleCode";
import { fetchFeedItem } from "@/lib/feed";
import { mergeArticleListWithDetail } from "@/lib/articleContent";
import { bindArticleContentImagesWithPreview, shouldEnableArticleImagePreview } from "@/lib/articleContentImagePreview";
import { shouldEnableArticleTTS } from "@/lib/articleContentTTS";
import { useArticleContentImagePreview } from "@/hooks/useArticleContentImagePreview";
import { useArticleContentTTS } from "@/hooks/useArticleContentTTS";
import {
  prepareMangaIntroDisplayContent,
} from "@/lib/comicChapterContent";
import { comicPageWidthCssValue } from "@/lib/comicPageWidth";
import { readerContentWidthCssValue } from "@/lib/readerContentWidth";
import { ComicChapterStream } from "@/components/ComicChapterStream";
import { NovelChapterStream } from "@/components/NovelChapterStream";
import { ComicPagesView } from "@/components/ComicPagesView";
import { useComicArticleDisplay } from "@/hooks/useComicArticleDisplay";
import { useComicChapterStream } from "@/hooks/useComicChapterStream";
import { useNovelChapterStream } from "@/hooks/useNovelChapterStream";
import {
  bindArticleContentPlayers,
  destroyArticleContentPlayers,
} from "@/lib/articleContentPlayer";
import { runtimeOpenDetail, shouldUseRuntimeV2, browserSessionOptionsFromPlugin } from "@/lib/runtimeV2";
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
  shouldApplyPlaybackResumeIntent,
} from "@/lib/playbackResume";
import { resolveEffectivePlayback, isPlaybackHistoryEnabled } from "@/lib/playbackConfig";
import {
  isSerialIntroPage,
  resolveSerialChapterItemLabel,
  resolveSerialChapterNeighbors,
  shouldShowSerialChapterPager,
} from "@/lib/serialMedia";
import { NovelReaderSettingsButton } from "@/components/NovelReaderSettingsButton";
import { enhanceNovelChapterDisplayContent } from "@/lib/novelChapterContent";
import {
  novelReaderSettingsToStyle,
  readStoredNovelReaderSettings,
  type NovelReaderSettings,
} from "@/lib/novelReaderSettings";
import type { PlaybackResumeIntent, PlaybackProgress } from "@/types";
import { resolveYouTubeVideoId } from "@/lib/youtube";
import { resolveArticleAudioUrl, stripEmbeddedAudioFromContent } from "@/lib/articleAudioUrl";
import { resolveArticleCoverImage } from "@/lib/articleAudioPlaylist";
import { snapshotContentVideoProgress } from "@/lib/sessionVideoProgress";
import type { ReaderSessionMode } from "@/lib/readerSessions";
import type { ExperienceMode } from "@/lib/experienceMode";
import type { Article, ChannelCapabilities, Plugin, ThemeMode } from "@/types";

interface ArticleReaderModalProps {
  sessionId: string;
  theme: ThemeMode;
  runtimeBase: string | null;
  article: Article;
  readerFontScale: number;
  comicPageWidth?: number;
  onComicPageWidthChange?: (width: number) => void;
  readerContentWidth?: number;
  onReaderContentWidthChange?: (width: number) => void;
  novelReaderSettings?: NovelReaderSettings;
  onNovelReaderSettingsChange?: (settings: NovelReaderSettings) => void;
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
  experienceMode?: ExperienceMode;
}

export function ArticleReaderModal({
  sessionId,
  theme,
  runtimeBase,
  article: initialArticle,
  readerFontScale,
  comicPageWidth = 70,
  onComicPageWidthChange,
  readerContentWidth = 80,
  onReaderContentWidthChange,
  novelReaderSettings = readStoredNovelReaderSettings(),
  onNovelReaderSettingsChange,
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
  experienceMode = "safe",
}: ArticleReaderModalProps) {
  const isExpanded = mode === "expanded";
  const [article, setArticle] = useState(initialArticle);
  const [loading, setLoading] = useState(false);
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const [chaptersDrawerOpen, setChaptersDrawerOpen] = useState(false);
  const [novelPlaybackChapter, setNovelPlaybackChapter] = useState<Article | null>(null);
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
  const { openImagePreview, previewLightbox } = useArticleContentImagePreview(runtimeBase);
  const { bindTTS, ttsOverlays } = useArticleContentTTS(theme, {
    experienceUnlocked: experienceMode === "full",
  });
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
      void runtimeOpenDetail(article.pluginId, channelId, itemId, {
        ...browserSessionOptionsFromPlugin(pluginMeta),
      })
        .then(result => {
          if (cancelled || !result.item) return;
          setArticle(prev => {
            if (prev.id !== itemId) return prev;
            const next = mergeArticleListWithDetail(prev, result.item!);
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
          const next = mergeArticleListWithDetail(prev, detail);
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
    if (resolveArticleAudioUrl(article) !== null) {
      return true;
    }
    if (article.type === "text") {
      return Boolean(article.image?.trim()) && !coverImageFailed;
    }
    if (article.type === "video") {
      return Boolean(resolveYouTubeVideoId(article) || article.videoUrl?.trim());
    }
    if (article.type === "audio") {
      return resolveArticleAudioUrl(article) !== null;
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
  const audioUrl = useMemo(() => resolveArticleAudioUrl(article), [article]);
  const audioCoverImage = useMemo(
    () => resolveArticleCoverImage(article, {
      listArticles: [initialArticle],
      parentArticle: chaptersParent,
    }),
    [article, initialArticle, chaptersParent],
  );
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

  const {
    pageUrls: comicPageUrls,
    html: comicHtml,
    isComicHtml,
    isComicReader: isComicReaderContent,
  } = useComicArticleDisplay(article, runtimeBase, theme);

  const baseDisplayContent = useMemo(() => {
    if (!comicHtml) return "";
    if (!hasSessionVideoMedia) return comicHtml;
    return stripEmbeddedVideosFromContent(comicHtml);
  }, [comicHtml, hasSessionVideoMedia]);

  // Keep stream enabled without requiring activeChapter — brief clears during
  // reload must not disable the hook or remount page images (CDN 403).
  const canUseComicChapterStream = Boolean(
    isComicReaderContent
    && chapters.isActive
    && chaptersParent,
  );

  const comicStream = useComicChapterStream({
    enabled: canUseComicChapterStream,
    parent: chaptersParent,
    chapterItems: chapters.items,
    activeChapter: chapters.activeChapter,
    activeChapterDetail: article,
    detailLoading: chapters.detailLoading,
    channelId,
    runtimeBase,
    theme,
    scrollRootRef,
  });

  const useComicChapterStreamMode = canUseComicChapterStream;
  const comicChapterStreamActive = comicStream.slots.length > 0;

  const canUseNovelChapterStream = Boolean(
    pluginMeta?.mediaType === "novel"
    && chapters.isActive
    && chaptersParent
    && chapters.activeChapter
    && chapters.items.findIndex(item => item.id === chapters.activeChapter?.id) > 0,
  );

  const novelStream = useNovelChapterStream({
    enabled: canUseNovelChapterStream,
    parent: chaptersParent,
    chapterItems: chapters.items,
    activeChapter: chapters.activeChapter,
    activeChapterDetail: article,
    detailLoading: chapters.detailLoading,
    canLoadMoreChapters: channelCapabilities.canLoadMoreChapters,
    hasMoreChapters: chapters.hasMore,
    loadMoreChapters: chapters.loadMore,
    channelId,
    runtimeBase,
    theme,
    scrollRootRef,
    onChapterDetailFetched: setNovelPlaybackChapter,
  });

  const novelChapterStreamActive = canUseNovelChapterStream && novelStream.slots.length > 0;

  useEffect(() => {
    if (pluginMeta?.mediaType !== "novel") {
      setNovelPlaybackChapter(null);
    }
  }, [pluginMeta?.mediaType]);

  const articleImagePreviewEnabled = shouldEnableArticleImagePreview({
    isComicReaderContent,
    comicChapterStreamActive,
    pluginMediaType: pluginMeta?.mediaType,
  });
  const articleTTSEnabled = shouldEnableArticleTTS({
    isComicReaderContent,
    comicChapterStreamActive,
    pluginMediaType: pluginMeta?.mediaType,
  });

  const comicToolbarChapter = comicStream.isActive
    ? (comicStream.visibleChapter ?? chapters.activeChapter ?? article)
    : novelStream.isActive
      ? (novelStream.visibleChapter ?? chapters.activeChapter ?? article)
      : (chapters.activeChapter ?? article);

  const toolbarNavChapterId = useMemo(() => {
    if (!chapters.isActive) return null;
    const candidates = [
      novelStream.visibleChapter?.id,
      comicStream.visibleChapter?.id,
      chapters.activeChapter?.id,
      article?.id,
    ].filter((id): id is string => Boolean(id));
    for (const id of candidates) {
      if (chapters.items.some(item => item.id === id)) return id;
    }
    return chapters.activeChapter?.id ?? null;
  }, [
    chapters.isActive,
    chapters.items,
    chapters.activeChapter?.id,
    novelStream.visibleChapter?.id,
    comicStream.visibleChapter?.id,
    article?.id,
  ]);

  const activeChapterId = toolbarNavChapterId
    ?? comicToolbarChapter?.id
    ?? chapters.activeChapter?.id
    ?? article.id;

  const isMangaIntroPage = Boolean(
    isSerialIntroPage({
      mediaType: pluginMeta?.mediaType,
      chaptersActive: chapters.isActive && Boolean(chaptersParent),
      chapterItems: chapters.items,
      activeChapterId,
      isComicReaderContent,
      hasDisplayContent: Boolean(baseDisplayContent),
    }),
  );

  const displayContent = useMemo(() => {
    if (!baseDisplayContent) return "";
    let content = baseDisplayContent;
    if (isMangaIntroPage) {
      content = prepareMangaIntroDisplayContent(content);
    } else if (pluginMeta?.mediaType === "novel") {
      content = enhanceNovelChapterDisplayContent(content, article.title);
    }
    if (audioUrl) {
      content = stripEmbeddedAudioFromContent(content);
    }
    return content;
  }, [baseDisplayContent, isMangaIntroPage, pluginMeta?.mediaType, article.title, audioUrl]);

  const isNovelReading = pluginMeta?.mediaType === "novel";
  const novelReaderStyle = isNovelReading
    ? novelReaderSettingsToStyle(novelReaderSettings)
    : undefined;

  const serialChapterItemLabel = resolveSerialChapterItemLabel(
    pluginMeta?.mediaType,
    channelCapabilities.chaptersItemLabel,
  );

  const playbackContentRef = novelChapterStreamActive
    ? novelStream.streamContainerRef
    : comicChapterStreamActive
      ? comicStream.streamContainerRef
      : contentRef;

  const playbackArticle = article;
  const resumeChapterId = chapters.activeChapter?.id ?? article.id;
  const playbackContentSurfaceKey = novelChapterStreamActive
    ? "novel-stream"
    : comicChapterStreamActive
      ? "comic-stream"
      : isMangaIntroPage
        ? "novel-intro"
        : "article";

  const playbackHistoryEnabled = isPlaybackHistoryEnabled(
    pluginMeta,
    chaptersParent ? activeChannel : channelId,
    channelCapabilities,
  );

  const showContentLoading = loading
    || chapters.detailLoading
    || (chapters.isActive && chapters.loading);
  const hasRenderableContent = Boolean(
    comicPageUrls?.length
    || comicHtml
    || displayContent
    || comicStream.slots.some(slot => slot.status === "ready")
    || (canUseNovelChapterStream && novelStream.slots.some(slot => slot.status === "ready")),
  );
  const showContentLoadingPlaceholder = showContentLoading && !hasRenderableContent;

  usePlaybackProgress({
    pluginMeta,
    channelId,
    recordChannelId: chaptersParent ? activeChannel : channelId,
    feedChannelId: chaptersParent ? activeChannel : undefined,
    feedChannelCapabilities: chaptersParent ? channelCapabilities : undefined,
    parentArticle: chaptersParent,
    article: playbackArticle,
    sessionId,
    contentRef: playbackContentRef,
    scrollRootRef,
    runtimeBase,
    contentReady: (
      novelChapterStreamActive
        ? novelStream.slots.some(slot => slot.status === "ready")
        : comicChapterStreamActive
          ? comicStream.slots.some(slot => slot.status === "ready")
          : Boolean(comicPageUrls?.length || displayContent)
    ) && !showContentLoading,
    contentSurfaceKey: playbackContentSurfaceKey,
    novelChapterRecord: novelPlaybackChapter ?? undefined,
    historyEnabled: playbackHistoryEnabled,
    enabled: isExpanded && playbackHistoryEnabled,
  });

  useEffect(() => {
    const contentRoot = novelChapterStreamActive
      ? novelStream.streamContainerRef.current
      : comicChapterStreamActive
        ? comicStream.streamContainerRef.current
        : contentRef.current;
    if (!contentRoot) return;

    const hasStreamContent = novelChapterStreamActive
      ? novelStream.slots.some(slot => slot.status === "ready")
      : comicChapterStreamActive
        ? comicStream.slots.some(slot => slot.status === "ready")
        : Boolean(comicPageUrls?.length || comicHtml);
    if (!hasStreamContent && !displayContent) return;

    let unbindContentImages = () => {};
    let unbindTTS = () => {};

    if (!isComicReaderContent && !novelChapterStreamActive) {
      highlightArticleCode(contentRoot);
      unbindContentImages = bindArticleContentImagesWithPreview(contentRoot, runtimeBase, {
        onImagePreview: openImagePreview,
        previewEnabled: articleImagePreviewEnabled,
      });
      unbindTTS = bindTTS(contentRoot, { enabled: articleTTSEnabled });
      bindArticleContentPlayers(contentRoot, { sessionId, runtimeBase });
    } else if (isComicHtml) {
      unbindContentImages = bindArticleContentImagesWithPreview(contentRoot, runtimeBase, {
        previewEnabled: false,
      });
    } else if (novelChapterStreamActive) {
      highlightArticleCode(contentRoot);
      unbindContentImages = bindArticleContentImagesWithPreview(contentRoot, runtimeBase, {
        onImagePreview: openImagePreview,
        previewEnabled: articleImagePreviewEnabled,
      });
      unbindTTS = bindTTS(contentRoot, { enabled: articleTTSEnabled });
    }

    if (
      isExpanded
      && !hasSessionVideoMedia
      && shouldApplyPlaybackResumeIntent(resolvedResumeIntent, resumeChapterId)
      && !resumeAppliedRef.current
      && !showContentLoading
    ) {
      resumeAppliedRef.current = true;
      const mode = resolvedResumeIntent!.mode ?? resolveEffectivePlayback(pluginMeta, channelId, channelCapabilities).mode;
      applyPlaybackResume(mode, resolvedResumeIntent!.progress, {
        sessionId,
        contentRoot,
        scrollRoot: scrollRootRef.current,
        chapterId: resolvedResumeIntent!.chapterId,
        runtimeBase,
      });
      onResumeApplied?.();
    }

    return () => {
      unbindContentImages();
      unbindTTS();
      if (!isComicReaderContent && !novelChapterStreamActive) {
        destroyArticleContentPlayers(contentRoot);
      }
    };
  }, [
    displayContent,
    comicPageUrls,
    comicHtml,
    isComicHtml,
    isComicReaderContent,
    comicChapterStreamActive,
    novelChapterStreamActive,
    useComicChapterStreamMode,
    comicStream.slots,
    comicStream.streamContainerRef,
    novelStream.slots,
    novelStream.streamContainerRef,
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
    openImagePreview,
    bindTTS,
    articleImagePreviewEnabled,
    articleTTSEnabled,
    chapters.activeChapter?.id,
    article.id,
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

  const headerButtonClass = "orbit-reader-modal-header-btn";

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
      variant="icon"
      className={headerButtonClass}
    />
  ) : null;

  const goToChapter = (chapter: Article) => {
    resumeAppliedRef.current = true;
    if (
      canUseNovelChapterStream
      && novelStream.slots.some(slot => slot.chapter.id === chapter.id)
      && novelStream.scrollToChapterInStream(chapter.id)
    ) {
      return;
    }
    if (scrollRootRef.current) {
      scrollRootRef.current.scrollTop = 0;
    }
    void chapters.selectChapter(chapter);
  };

  const goToNextChapter = () => {
    resumeAppliedRef.current = true;
    const neighbors = resolveSerialChapterNeighbors({
      chapterItems: chapters.items,
      activeChapterId,
      hasMoreChapters: chapters.hasMore && channelCapabilities.canLoadMoreChapters,
    });
    if (neighbors.next) {
      if (
        canUseNovelChapterStream
        && novelStream.slots.some(slot => slot.chapter.id === neighbors.next!.id)
        && novelStream.scrollToChapterInStream(neighbors.next.id)
      ) {
        return;
      }
      if (scrollRootRef.current) {
        scrollRootRef.current.scrollTop = 0;
      }
      void chapters.selectChapter(neighbors.next);
      return;
    }
    if (scrollRootRef.current) {
      scrollRootRef.current.scrollTop = 0;
    }
    if (neighbors.canLoadMoreNext) {
      void chapters.selectRelativeChapter(1);
    }
  };

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
      activeItemId={activeChapterId}
      itemLabel={channelCapabilities.chaptersItemLabel}
      onSelect={chapter => {
        setChaptersDrawerOpen(false);
        goToChapter(chapter);
      }}
      onLoadMore={chapters.loadMore}
      onRefresh={chapters.refresh}
      onClearAndRefresh={chapters.clearAndRefresh}
    />
  ) : null;

  const chapterPager = useMemo(() => {
    if (!shouldShowSerialChapterPager({
      mediaType: pluginMeta?.mediaType,
      chaptersActive: chapters.isActive,
      chapterItems: chapters.items,
      activeChapterId,
      isComicReaderContent,
      streamActive: comicChapterStreamActive || novelChapterStreamActive,
    })) {
      return null;
    }
    if (!activeChapterId) return null;
    const { prev, next, canLoadMoreNext } = resolveSerialChapterNeighbors({
      chapterItems: chapters.items,
      activeChapterId,
      hasMoreChapters: chapters.hasMore && channelCapabilities.canLoadMoreChapters,
    });
    if (!prev && !next && !canLoadMoreNext) return null;

    return (
      <div className="mt-8 pt-6 border-t orbit-detail-divider">
        <div className="flex items-center justify-between gap-3">
          {prev ? (
            <button
              type="button"
              onClick={() => goToChapter(prev)}
              className="px-4 py-2 rounded-xl text-sm font-semibold border orbit-detail-divider hover:bg-[color-mix(in_srgb,var(--orbit-accent)_8%,transparent)] transition-colors"
              title={`上一${serialChapterItemLabel}：${prev.title}`}
            >
              上一{serialChapterItemLabel}
            </button>
          ) : (
            <span />
          )}

          {next || canLoadMoreNext ? (
            <button
              type="button"
              onClick={goToNextChapter}
              className="px-4 py-2 rounded-xl text-sm font-semibold border orbit-detail-divider hover:bg-[color-mix(in_srgb,var(--orbit-accent)_8%,transparent)] transition-colors"
              title={next
                ? `下一${serialChapterItemLabel}：${next.title}`
                : `加载更多${serialChapterItemLabel}`}
            >
              下一{serialChapterItemLabel}
            </button>
          ) : null}
        </div>
      </div>
    );
  }, [
    chapters,
    pluginMeta?.mediaType,
    isComicReaderContent,
    activeChapterId,
    comicChapterStreamActive,
    novelChapterStreamActive,
    serialChapterItemLabel,
    channelCapabilities.canLoadMoreChapters,
  ]);

  const introStartReading = useMemo(() => {
    if (!chapters.isActive || !isMangaIntroPage) return null;
    const activeId = chapters.activeChapter?.id ?? null;
    if (!activeId) return null;
    const { next, canLoadMoreNext } = resolveSerialChapterNeighbors({
      chapterItems: chapters.items,
      activeChapterId: activeId,
      hasMoreChapters: chapters.hasMore && channelCapabilities.canLoadMoreChapters,
    });
    if (!next && !canLoadMoreNext) return null;

    return (
      <div className="mt-8 pt-6 border-t orbit-detail-divider flex justify-center">
        <button
          type="button"
          onClick={() => {
            if (next) {
              goToChapter(next);
              return;
            }
            goToNextChapter();
          }}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold text-neutral-950 bg-[var(--orbit-accent)] hover:opacity-90 transition-opacity"
          title={next ? `开始阅读：${next.title}` : "开始阅读"}
        >
          开始阅读
          <Icon name="arrow-left" className="w-4 h-4 rotate-180" />
        </button>
      </div>
    );
  }, [chapters, isMangaIntroPage, channelCapabilities.canLoadMoreChapters]);

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
        className="relative w-full max-w-4xl h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden orbit-reader-modal orbit-reader-chrome"
        onClick={event => event.stopPropagation()}
        role={isExpanded ? "dialog" : undefined}
        aria-modal={isExpanded ? true : undefined}
        aria-labelledby={isExpanded ? "article-reader-modal-title" : undefined}
      >
        {isExpanded ? (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
            {isNovelReading && onNovelReaderSettingsChange ? (
              <NovelReaderSettingsButton
                theme={theme}
                settings={novelReaderSettings}
                onChange={onNovelReaderSettingsChange}
                variant="icon"
                className={headerButtonClass}
              />
            ) : null}
            {isComicReaderContent && onComicPageWidthChange ? (
              <div className="rounded-full px-2 py-1 bg-[color-mix(in_srgb,var(--orbit-bg)_55%,transparent)]">
                <ComicPageWidthSlider
                  theme={theme}
                  value={comicPageWidth}
                  onChange={onComicPageWidthChange}
                />
              </div>
            ) : !isNovelReading && onReaderContentWidthChange ? (
              <div className="rounded-full px-2 py-1 bg-[color-mix(in_srgb,var(--orbit-bg)_55%,transparent)]">
                <ComicPageWidthSlider
                  theme={theme}
                  value={readerContentWidth}
                  onChange={onReaderContentWidthChange}
                  title="调节阅读宽度"
                  ariaLabel="阅读宽度"
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
          className={`flex-1 min-h-0 overflow-y-auto article-reader px-5 sm:px-8 py-6 sm:py-8${isComicReaderContent ? " article-reader--comic" : ""}${isMangaIntroPage ? " article-reader--manga-intro" : ""}${isNovelReading ? " article-reader--novel" : ""}`}
          data-novel-background={isNovelReading ? novelReaderSettings.background : undefined}
          style={{
            "--reader-scale": readerFontScale,
            "--comic-page-width": comicPageWidthCssValue(comicPageWidth),
            "--reader-content-width": readerContentWidthCssValue(readerContentWidth),
            ...novelReaderStyle,
          } as React.CSSProperties}
        >
          <div className="space-y-6">
            {isSocialPlugin(pluginMeta) ? (
              <SocialNoteDetail article={article} runtimeBase={runtimeBase} />
            ) : (
            <>
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
              {!showRatingHero && !isComicReaderContent && !isNovelReading ? (
                <div className={`flex items-start gap-3 ${isExpanded ? "pr-20" : "pr-8"}`}>
                  <h2
                    id="article-reader-modal-title"
                    className="article-reader-title font-extrabold tracking-tight leading-tight flex-1 min-w-0"
                  >
                    {article.title}
                  </h2>
                </div>
              ) : null}

            {showArticleMedia && !showRatingHero && (article.type === "video" || audioUrl) ? (
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

                {audioUrl && !hasSessionVideoMedia ? (
                  <div className="p-4 md:p-6 bg-[var(--orbit-surface)]">
                    <ReaderAudioPlayer
                      sessionId={sessionId}
                      article={article}
                      audioUrl={audioUrl}
                      runtimeBase={runtimeBase}
                      coverImage={audioCoverImage}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {!showRatingHero && !isComicReaderContent && (article.tags ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(article.tags ?? []).map((tag, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 rounded-full text-xs font-medium orbit-detail-tag"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}

            {showContentLoadingPlaceholder ? (
              <div className="mt-6 flex items-center gap-2 text-sm orbit-detail-meta">
                <span className="inline-block w-4 h-4 border-2 border-[color-mix(in_srgb,var(--orbit-accent)_35%,transparent)] border-t-[var(--orbit-accent)] rounded-full animate-spin" />
                加载正文中…
              </div>
            ) : comicChapterStreamActive ? (
                <ComicChapterStream
                  slots={comicStream.slots}
                  streamContainerRef={comicStream.streamContainerRef}
                  theme={theme}
                  runtimeBase={runtimeBase}
                  reachedEnd={comicStream.reachedEnd}
                />
            ) : canUseNovelChapterStream ? (
                <>
                  <NovelChapterStream
                    slots={novelStream.slots}
                    streamContainerRef={novelStream.streamContainerRef}
                    theme={theme}
                    reachedEnd={novelStream.reachedEnd}
                  />
                  {chapterPager}
                </>
            ) : comicPageUrls?.length ? (
              <ComicPagesView
                ref={contentRef}
                pages={comicPageUrls}
                runtimeBase={runtimeBase}
                theme={theme}
                className="article-content comic-chapter-pages comic-pages-json mt-6"
              />
            ) : displayContent ? (
              <>
                <div
                  ref={contentRef}
                  data-theme={articleContentTheme(theme)}
                  className={`article-content mt-6${isMangaIntroPage ? " article-content--manga-intro" : ""}${isNovelReading && !isMangaIntroPage ? " article-content--novel" : ""}`}
                  dangerouslySetInnerHTML={{ __html: displayContent }}
                />
                {introStartReading}
                {chapterPager}
                {article.sourceUrl ? (
                  <div className="mt-8 pt-6 border-t orbit-detail-divider">
                    <a
                      href={article.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm orbit-detail-link hover:underline"
                    >
                      阅读原文 →
                    </a>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-6 border-t border-dashed orbit-detail-divider pt-6 space-y-4">
                {article.summary?.trim() ? (
                  <p className="text-base orbit-detail-meta leading-relaxed italic">
                    “ {article.summary} ”
                  </p>
                ) : null}
                {article.sourceUrl ? (
                  <a
                    href={article.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-sm orbit-detail-link hover:underline"
                  >
                    阅读原文 →
                  </a>
                ) : (
                  <p className="text-sm orbit-detail-subtle">
                    （这是一个带有交互式卡片的媒体项目资源，详情请在正文中直接点击交互并体验。）
                  </p>
                )}
              </div>
            )}
            </div>
            </>
            )}
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

  return (
    <>
      {createPortal(modal, document.body)}
      {previewLightbox}
      {ttsOverlays}
    </>
  );
}
