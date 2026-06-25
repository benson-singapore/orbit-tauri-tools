import { useEffect, useMemo, useRef, useState } from "react";
import { articleContentTheme } from "@/lib/themeMode";
import { ProxiedImage } from "@/components/ProxiedImage";
import { Icon } from "@/components/Icon";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
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
import { highlightArticleCode } from "@/lib/highlightArticleCode";
import { fetchFeedItem } from "@/lib/feed";
import { bindArticleContentImages } from "@/lib/imageProxy";
import {
  prepareMangaIntroDisplayContent,
} from "@/lib/comicChapterContent";
import { comicPageWidthCssValue } from "@/lib/comicPageWidth";
import { ComicChapterStream } from "@/components/ComicChapterStream";
import { ComicPagesView } from "@/components/ComicPagesView";
import { useComicArticleDisplay } from "@/hooks/useComicArticleDisplay";
import { useComicChapterStream } from "@/hooks/useComicChapterStream";
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
} from "@/lib/playbackResume";
import { resolveEffectivePlayback } from "@/lib/playbackConfig";
import { runtimeOpenDetail, shouldUseRuntimeV2 } from "@/lib/runtimeV2";
import { resolveYouTubeVideoId } from "@/lib/youtube";
import type { Article, ChannelCapabilities, PlaybackResumeIntent, Plugin, ThemeMode } from "@/types";

interface ArticleDetailPanelProps {
  sessionId: string;
  theme: ThemeMode;
  runtimeBase: string | null;
  article: Article;
  readerFontScale: number;
  comicPageWidth?: number;
  hasDetail: boolean;
  activeChannel: string;
  pluginMeta?: Plugin;
  channelCapabilities: ChannelCapabilities;
  storedChannel?: string | null;
}

export function ArticleDetailPanel({
  sessionId,
  theme,
  runtimeBase,
  article: initialArticle,
  readerFontScale,
  comicPageWidth = 70,
  hasDetail,
  activeChannel,
  pluginMeta,
  channelCapabilities,
  storedChannel,
}: ArticleDetailPanelProps) {
  const [article, setArticle] = useState(initialArticle);
  const [loading, setLoading] = useState(false);
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const [chaptersDrawerOpen, setChaptersDrawerOpen] = useState(false);
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const resumeAppliedRef = useRef(false);
  const [resolvedResumeIntent, setResolvedResumeIntent] = useState<PlaybackResumeIntent | undefined>();

  const hasChaptersMode = shouldOpenChaptersForArticle(
    initialArticle,
    pluginMeta,
    activeChannel,
    channelCapabilities,
    storedChannel,
  );

  const channelId = resolveArticleDetailChannel(initialArticle, pluginMeta, activeChannel);

  useEffect(() => {
    resumeAppliedRef.current = false;
    let cancelled = false;
    void fetchResumeIntentForArticle(
      initialArticle.pluginId,
      initialArticle.id,
      channelId,
    ).then(intent => {
      if (!cancelled) {
        setResolvedResumeIntent(intent);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialArticle.id, initialArticle.pluginId, channelId]);

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
  }, [initialArticle]);

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
      void runtimeOpenDetail(article.pluginId, channelId, itemId)
        .then(result => {
          if (cancelled || !result.item) return;
          setArticle(prev => (prev.id !== itemId ? prev : { ...prev, ...result.item }));
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
        setArticle(prev => (prev.id !== itemId ? prev : { ...prev, ...detail }));
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

  const youTubeVideoId = useMemo(() => resolveYouTubeVideoId(article), [article]);

  const {
    pageUrls: comicPageUrls,
    html: comicHtml,
    isComicHtml,
    isComicReader: isComicReaderContent,
  } = useComicArticleDisplay(article, runtimeBase, theme);

  const selectedItemHasComicReader = isComicHtml;

  const baseDisplayContent = comicHtml;

  const isMangaIntroPage = Boolean(
    hasChaptersMode
    && chapters.isActive
    && pluginMeta?.mediaType === "manga"
    && !isComicReaderContent
    && !selectedItemHasComicReader
    && baseDisplayContent,
  );

  const displayContent = useMemo(() => {
    if (!baseDisplayContent) return "";
    return isMangaIntroPage
      ? prepareMangaIntroDisplayContent(baseDisplayContent)
      : baseDisplayContent;
  }, [baseDisplayContent, isMangaIntroPage]);

  const canUseComicChapterStream = Boolean(
    isComicReaderContent
    && chapters.isActive
    && hasChaptersMode
    && initialArticle
    && chapters.activeChapter,
  );

  const useComicChapterStreamMode = canUseComicChapterStream;

  const comicStream = useComicChapterStream({
    enabled: useComicChapterStreamMode,
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

  const comicChapterStreamActive = useComicChapterStreamMode && comicStream.slots.length > 0;

  const comicToolbarChapter = comicStream.isActive
    ? (comicStream.visibleChapter ?? chapters.activeChapter ?? article)
    : (chapters.activeChapter ?? article);

  const toolbarNavChapterId = useMemo(() => {
    if (!chapters.isActive) return null;
    const candidates = [
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
    comicStream.visibleChapter?.id,
    article?.id,
  ]);

  const activeChapterId = toolbarNavChapterId
    ?? comicToolbarChapter?.id
    ?? chapters.activeChapter?.id
    ?? article.id;

  const playbackContentRef = comicChapterStreamActive
    ? comicStream.streamContainerRef
    : contentRef;

  const showContentLoading = loading
    || chapters.detailLoading
    || (chapters.isActive && chapters.loading);

  usePlaybackProgress({
    pluginMeta,
    channelId,
    channelCapabilities,
    parentArticle: hasChaptersMode ? initialArticle : null,
    article,
    sessionId,
    contentRef: playbackContentRef,
    scrollRootRef,
    runtimeBase,
    contentReady: (
      comicChapterStreamActive
        ? comicStream.slots.some(slot => slot.status === "ready")
        : Boolean(comicPageUrls?.length || comicHtml || displayContent)
    ) && !showContentLoading,
    enabled: true,
  });

  useEffect(() => {
    const contentRoot = comicChapterStreamActive
      ? comicStream.streamContainerRef.current
      : contentRef.current;
    if (!contentRoot) return;

    const hasComicContent = comicChapterStreamActive
      ? comicStream.slots.some(slot => slot.status === "ready")
      : Boolean(comicPageUrls?.length || comicHtml);
    if (!hasComicContent && !displayContent) return;

    if (!isComicReaderContent) {
      highlightArticleCode(contentRoot);
      bindArticleContentImages(contentRoot, runtimeBase);
      bindArticleContentPlayers(contentRoot, { sessionId });
    } else if (isComicHtml) {
      bindArticleContentImages(contentRoot, runtimeBase);
    }

    if (resolvedResumeIntent?.progress && !resumeAppliedRef.current && !showContentLoading) {
      resumeAppliedRef.current = true;
      const mode = resolvedResumeIntent.mode
        ?? resolveEffectivePlayback(pluginMeta, channelId, channelCapabilities).mode;
      applyPlaybackResume(mode, resolvedResumeIntent.progress, {
        sessionId,
        contentRoot,
        scrollRoot: scrollRootRef.current,
        chapterId: resolvedResumeIntent.chapterId,
        runtimeBase,
      });
    }

    return () => {
      if (!isComicReaderContent) {
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
    useComicChapterStreamMode,
    comicStream.slots,
    comicStream.streamContainerRef,
    runtimeBase,
    theme,
    sessionId,
    resolvedResumeIntent,
    showContentLoading,
    pluginMeta,
    channelId,
    channelCapabilities,
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
    if (!activeChapterId) return null;
    const idx = chapters.items.findIndex(item => item.id === activeChapterId);
    if (idx < 0) return null;
    const prev = idx > 0 ? chapters.items[idx - 1] : null;
    const next = idx < chapters.items.length - 1 ? chapters.items[idx + 1] : null;
    if (!prev && !next) return null;

    return (
      <div className="mt-8 pt-6 border-t orbit-detail-divider">
        <div className="flex items-center justify-between gap-3">
          {prev ? (
            <button
              type="button"
              onClick={() => {
                scrollRootRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                void chapters.selectChapter(prev);
              }}
              className="px-4 py-2 rounded-xl text-sm font-semibold border orbit-detail-divider hover:bg-[color-mix(in_srgb,var(--orbit-accent)_8%,transparent)] transition-colors"
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
              className="px-4 py-2 rounded-xl text-sm font-semibold border orbit-detail-divider hover:bg-[color-mix(in_srgb,var(--orbit-accent)_8%,transparent)] transition-colors"
              title={`下一话：${next.title}`}
            >
              下一话
            </button>
          ) : null}
        </div>
      </div>
    );
  }, [chapters, isComicReaderContent, activeChapterId]);

  const introStartReading = useMemo(() => {
    if (!chapters.isActive || pluginMeta?.mediaType !== "manga" || isComicReaderContent) return null;
    const activeId = chapters.activeChapter?.id ?? null;
    if (!activeId) return null;
    const idx = chapters.items.findIndex(item => item.id === activeId);
    if (idx < 0) return null;
    const next = idx < chapters.items.length - 1 ? chapters.items[idx + 1] : null;
    if (!next) return null;

    return (
      <div className="mt-8 pt-6 border-t orbit-detail-divider flex justify-center">
        <button
          type="button"
          onClick={() => {
            scrollRootRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            void chapters.selectChapter(next);
          }}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold text-neutral-950 bg-[var(--orbit-accent)] hover:opacity-90 transition-opacity"
          title={`开始阅读：${next.title}`}
        >
          开始阅读
          <Icon name="arrow-left" className="w-4 h-4 rotate-180" />
        </button>
      </div>
    );
  }, [chapters, isComicReaderContent, pluginMeta?.mediaType]);

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
            className={`article-reader space-y-6 px-4 pb-5 sm:px-5${isComicReaderContent ? " article-reader--comic" : ""}${isMangaIntroPage ? " article-reader--manga-intro" : ""}`}
            style={{
              "--reader-scale": readerFontScale,
              "--comic-page-width": comicPageWidthCssValue(comicPageWidth),
            } as React.CSSProperties}
          >
            <div className="space-y-4">
              {!showRatingHero && isComicReaderContent ? (
                <div className="flex justify-end">{chaptersOpenButton}</div>
              ) : null}
              {!showRatingHero && !isComicReaderContent ? (
              <div className="flex items-start gap-3">
                <h1 className="article-reader-title font-extrabold tracking-tight leading-tight flex-1 min-w-0">
                  {article.title}
                </h1>
                {chaptersOpenButton}
              </div>
              ) : null}

            {showArticleMedia && !showRatingHero && (article.type === "video" || article.type === "audio") ? (
              <div className="w-full rounded-2xl overflow-hidden shadow-md bg-neutral-100 dark:bg-neutral-900">
                {article.type === "video" ? (
                  <div className="relative aspect-video bg-neutral-950 flex flex-col items-center justify-center text-white">
                    {youTubeVideoId ? (
                      <YouTubeEmbed videoId={youTubeVideoId} title={article.title} />
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

            {showContentLoading ? (
              <div className="mt-6 flex items-center gap-2 text-sm orbit-detail-meta">
                <span className="inline-block w-4 h-4 border-2 border-[color-mix(in_srgb,var(--orbit-accent)_35%,transparent)] border-t-[var(--orbit-accent)] rounded-full animate-spin" />
                加载正文中…
              </div>
            ) : useComicChapterStreamMode && comicStream.slots.length > 0 ? (
                <ComicChapterStream
                  slots={comicStream.slots}
                  streamContainerRef={comicStream.streamContainerRef}
                  theme={theme}
                  runtimeBase={runtimeBase}
                  reachedEnd={comicStream.reachedEnd}
                />
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
                  className={`article-content mt-6${isMangaIntroPage ? " article-content--manga-intro" : ""}`}
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
    </div>
  );
}
