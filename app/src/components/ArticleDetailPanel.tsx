import { useEffect, useMemo, useRef, useState } from "react";
import { articleContentTheme } from "@/lib/themeMode";
import { Icon } from "@/components/Icon";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
import { ReaderAudioPlayer } from "@/components/ReaderAudioPlayer";
import { ChaptersDrawer } from "@/components/ChaptersDrawer";
import { ChaptersList } from "@/components/ChaptersList";
import { ChaptersOpenButton } from "@/components/ChaptersOpenButton";
import { ArticleRatingHero, shouldShowArticleRatingHero } from "@/components/ArticleRatingHero";
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
import { useArticleChapters, shouldOpenChaptersForArticle } from "@/hooks/useArticleChapters";
import { usePlaybackProgress } from "@/hooks/usePlaybackProgress";
import {
  applyPlaybackResume,
  fetchResumeIntentForArticle,
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
import { enhanceNovelChapterDisplayContent } from "@/lib/novelChapterContent";
import {
  novelReaderSettingsToStyle,
  type NovelReaderSettings,
} from "@/lib/novelReaderSettings";
import { runtimeOpenDetail, shouldUseRuntimeV2, browserSessionOptionsFromPlugin } from "@/lib/runtimeV2";
import { resolveYouTubeVideoId } from "@/lib/youtube";
import { resolveArticleAudioUrl, stripEmbeddedAudioFromContent } from "@/lib/articleAudioUrl";
import { resolveArticleCoverImage } from "@/lib/articleAudioPlaylist";
import type { Article, ChannelCapabilities, PlaybackResumeIntent, Plugin, ThemeMode } from "@/types";
import type { ExperienceMode } from "@/lib/experienceMode";

interface ArticleDetailPanelProps {
  sessionId: string;
  theme: ThemeMode;
  runtimeBase: string | null;
  article: Article;
  readerFontScale: number;
  comicPageWidth?: number;
  readerContentWidth?: number;
  novelReaderSettings?: NovelReaderSettings;
  hasDetail: boolean;
  activeChannel: string;
  pluginMeta?: Plugin;
  channelCapabilities: ChannelCapabilities;
  storedChannel?: string | null;
  experienceMode?: ExperienceMode;
}

export function ArticleDetailPanel({
  sessionId,
  theme,
  runtimeBase,
  article: initialArticle,
  readerFontScale,
  comicPageWidth = 70,
  readerContentWidth = 80,
  novelReaderSettings,
  hasDetail,
  activeChannel,
  pluginMeta,
  channelCapabilities,
  storedChannel,
  experienceMode = "safe",
}: ArticleDetailPanelProps) {
  const [article, setArticle] = useState(initialArticle);
  const [loading, setLoading] = useState(false);
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const [chaptersDrawerOpen, setChaptersDrawerOpen] = useState(false);
  const [novelPlaybackChapter, setNovelPlaybackChapter] = useState<Article | null>(null);
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const resumeAppliedRef = useRef(false);
  // undefined = loading; null = loaded but no resume record; PlaybackResumeIntent = loaded record
  const [resolvedResumeIntent, setResolvedResumeIntent] = useState<PlaybackResumeIntent | null | undefined>(undefined);
  const { openImagePreview, previewLightbox } = useArticleContentImagePreview(runtimeBase);
  const { bindTTS, ttsOverlays } = useArticleContentTTS(theme, {
    experienceUnlocked: experienceMode === "full",
  });

  const hasChaptersMode = shouldOpenChaptersForArticle(
    initialArticle,
    pluginMeta,
    activeChannel,
    channelCapabilities,
    storedChannel,
  );

  const channelId = resolveArticleDetailChannel(
    initialArticle,
    pluginMeta,
    activeChannel,
    storedChannel,
  );

  useEffect(() => {
    resumeAppliedRef.current = false;
    let cancelled = false;
    setResolvedResumeIntent(undefined);
    const playbackRecordChannelId = hasChaptersMode ? activeChannel : channelId;
    void fetchResumeIntentForArticle(
      initialArticle.pluginId,
      initialArticle.id,
      playbackRecordChannelId,
    ).then(intent => {
      if (!cancelled) {
        setResolvedResumeIntent(intent ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialArticle.id, initialArticle.pluginId, channelId, hasChaptersMode, activeChannel]);

  useEffect(() => {
    seedPlaybackResumeSnapshot(sessionId, resolvedResumeIntent?.progress, resolvedResumeIntent?.mode);
  }, [sessionId, resolvedResumeIntent?.progress, resolvedResumeIntent?.mode]);

  useEffect(() => {
    resumeAppliedRef.current = false;
  }, [resolvedResumeIntent?.chapterId, resolvedResumeIntent?.progress]);

  const chapters = useArticleChapters({
    parent: hasChaptersMode ? initialArticle : null,
    activeChannel,
    pluginMeta,
    capabilities: channelCapabilities,
    storedChannel,
    enabled: hasChaptersMode,
    initialChapterId: resolvedResumeIntent?.chapterId,
    onChapterDetail: setArticle,
    onChapterDetailLoaded: () => {
      resumeAppliedRef.current = false;
    },
  });

  useEffect(() => {
    setArticle(initialArticle);
    setCoverImageFailed(false);
    setChaptersDrawerOpen(false);
  }, [initialArticle.id, initialArticle.pluginId]);

  const effectiveHasDetail = resolveArticleHasDetail(
    article,
    pluginMeta,
    activeChannel,
    { hasDetail },
  );

  useEffect(() => {
    const itemId = article.id;
    if (hasChaptersMode) {
      setLoading(false);
      return;
    }

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
          setArticle(prev => (
            prev.id !== itemId || !result.item
              ? prev
              : mergeArticleListWithDetail(prev, result.item)
          ));
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
        setArticle(prev => (prev.id !== itemId ? prev : mergeArticleListWithDetail(prev, detail)));
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
  }, [article.id, pluginMeta, effectiveHasDetail, channelId, hasChaptersMode]);

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

  const youTubeVideoId = useMemo(() => resolveYouTubeVideoId(article), [article]);
  const audioUrl = useMemo(() => resolveArticleAudioUrl(article), [article]);
  const audioCoverImage = useMemo(
    () => resolveArticleCoverImage(article, {
      listArticles: [initialArticle],
      parentArticle: hasChaptersMode ? initialArticle : null,
    }),
    [article, initialArticle, hasChaptersMode],
  );

  const {
    pageUrls: comicPageUrls,
    html: comicHtml,
    isComicHtml,
    isComicReader: isComicReaderContent,
  } = useComicArticleDisplay(article, runtimeBase, theme);

  const baseDisplayContent = comicHtml;

  // Keep stream enabled without requiring activeChapter — brief clears during
  // reload must not disable the hook or remount page images (CDN 403).
  const canUseComicChapterStream = Boolean(
    isComicReaderContent
    && chapters.isActive
    && hasChaptersMode
    && initialArticle,
  );

  const comicStream = useComicChapterStream({
    enabled: canUseComicChapterStream,
    parent: hasChaptersMode ? initialArticle : null,
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
    && hasChaptersMode
    && initialArticle
    && chapters.activeChapter
    && chapters.items.findIndex(item => item.id === chapters.activeChapter?.id) > 0,
  );

  const novelStream = useNovelChapterStream({
    enabled: canUseNovelChapterStream,
    parent: hasChaptersMode ? initialArticle : null,
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
      chaptersActive: hasChaptersMode && chapters.isActive,
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
  const novelReaderStyle = isNovelReading && novelReaderSettings
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
    hasChaptersMode ? activeChannel : channelId,
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
    recordChannelId: hasChaptersMode ? activeChannel : channelId,
    feedChannelId: hasChaptersMode ? activeChannel : undefined,
    feedChannelCapabilities: hasChaptersMode ? channelCapabilities : undefined,
    parentArticle: hasChaptersMode ? initialArticle : null,
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
          : Boolean(comicPageUrls?.length || comicHtml || displayContent)
    ) && !showContentLoading,
    contentSurfaceKey: playbackContentSurfaceKey,
    novelChapterRecord: novelPlaybackChapter ?? undefined,
    historyEnabled: playbackHistoryEnabled,
    // Avoid overwriting existing playback record before resume intent is loaded.
    enabled: playbackHistoryEnabled && resolvedResumeIntent !== undefined,
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
      shouldApplyPlaybackResumeIntent(resolvedResumeIntent ?? undefined, resumeChapterId)
      && !resumeAppliedRef.current
      && !showContentLoading
    ) {
      resumeAppliedRef.current = true;
      const mode = resolvedResumeIntent!.mode
        ?? resolveEffectivePlayback(pluginMeta, channelId, channelCapabilities).mode;
      applyPlaybackResume(mode, resolvedResumeIntent!.progress, {
        sessionId,
        contentRoot,
        scrollRoot: scrollRootRef.current,
        chapterId: resolvedResumeIntent!.chapterId,
        runtimeBase,
      });
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
    resolvedResumeIntent,
    showContentLoading,
    pluginMeta,
    channelId,
    channelCapabilities,
    openImagePreview,
    bindTTS,
    articleImagePreviewEnabled,
    articleTTSEnabled,
    chapters.activeChapter?.id,
    article.id,
  ]);

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

  const chaptersList = chapters.isActive && initialArticle ? (
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
      parentItem={initialArticle}
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

  if (isSocialPlugin(pluginMeta)) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <div ref={scrollRootRef} className="flex-1 min-h-0 w-full overflow-y-auto px-4 sm:px-5 pb-5">
          <SocialNoteDetail article={article} runtimeBase={runtimeBase} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {showRatingHero ? (
        <div className="shrink-0 w-full px-4 pt-4 sm:px-5 sm:pt-5">
          <ArticleRatingHero
            article={article}
            theme={theme}
            runtimeBase={runtimeBase}
            trailing={chaptersOpenButton}
            onCoverError={() => setCoverImageFailed(true)}
          />
        </div>
      ) : null}

      <div ref={scrollRootRef} className="flex-1 min-h-0 w-full overflow-y-auto">
          <div
            className={`article-reader space-y-6 px-4 pb-5 sm:px-5${isComicReaderContent ? " article-reader--comic" : ""}${isMangaIntroPage ? " article-reader--manga-intro" : ""}${isNovelReading ? " article-reader--novel" : ""}`}
            data-novel-background={isNovelReading && novelReaderSettings ? novelReaderSettings.background : undefined}
            style={{
              "--reader-scale": readerFontScale,
              "--comic-page-width": comicPageWidthCssValue(comicPageWidth),
              "--reader-content-width": readerContentWidthCssValue(readerContentWidth),
              ...novelReaderStyle,
            } as React.CSSProperties}
          >
            <div className="space-y-4">
              {!showRatingHero && isComicReaderContent ? (
                <div className="flex justify-end">{chaptersOpenButton}</div>
              ) : null}
              {!showRatingHero && !isComicReaderContent && !isNovelReading ? (
              <div className="flex items-start gap-3">
                <h1 className="article-reader-title font-extrabold tracking-tight leading-tight flex-1 min-w-0">
                  {article.title}
                </h1>
                {chaptersOpenButton}
              </div>
              ) : null}

            {showArticleMedia && !showRatingHero && (article.type === "video" || audioUrl) ? (
              <div className="w-full rounded-2xl overflow-hidden shadow-md bg-neutral-100 dark:bg-neutral-900">
                {article.type === "video" ? (
                  <div className="relative aspect-video bg-neutral-950 flex flex-col items-center justify-center text-white">
                    {youTubeVideoId ? (
                      <YouTubeEmbed
                        runtimeBase={runtimeBase}
                        videoId={youTubeVideoId}
                        title={article.title}
                      />
                    ) : article.videoUrl ? (
                      <video
                        src={article.videoUrl}
                        className="w-full h-full object-cover"
                        controls
                      />
                    ) : null}
                    <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full text-xs flex items-center gap-1.5 backdrop-blur-md pointer-events-none">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span>{youTubeVideoId ? "YouTube" : "视频流"}</span>
                    </div>
                  </div>
                ) : null}

                {audioUrl && article.type !== "video" ? (
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
        </div>
      </div>

      <ChaptersDrawer
        open={chaptersDrawerOpen}
        theme={theme}
        title={chapters.title || "选集"}
        onClose={() => setChaptersDrawerOpen(false)}
      >
        {chaptersList}
      </ChaptersDrawer>

      {previewLightbox}
      {ttsOverlays}
    </div>
  );
}
