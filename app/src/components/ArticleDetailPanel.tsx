import { useEffect, useMemo, useRef, useState } from "react";
import { articleContentTheme, isDarkTheme } from "@/lib/themeMode";
import { ProxiedImage } from "@/components/ProxiedImage";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
import { ChaptersDrawer } from "@/components/ChaptersDrawer";
import { ChaptersList } from "@/components/ChaptersList";
import { ChaptersOpenButton } from "@/components/ChaptersOpenButton";
import { ArticleRatingHero, shouldShowArticleRatingHero } from "@/components/ArticleRatingHero";
import {
  dedupeCoverImageFromContent,
  prepareArticleHtmlContent,
} from "@/lib/articleContent";
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
import { useArticleChapters, shouldOpenChaptersForArticle } from "@/hooks/useArticleChapters";
import { runtimeOpenDetail, shouldUseRuntimeV2 } from "@/lib/runtimeV2";
import { resolveYouTubeVideoId } from "@/lib/youtube";
import type { Article, ChannelCapabilities, Plugin, ThemeMode } from "@/types";

interface ArticleDetailPanelProps {
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
}

export function ArticleDetailPanel({
  theme,
  runtimeBase,
  article: initialArticle,
  readerFontScale,
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
  const contentRef = useRef<HTMLDivElement>(null);

  const hasChaptersMode = shouldOpenChaptersForArticle(
    initialArticle,
    pluginMeta,
    activeChannel,
    channelCapabilities,
    storedChannel,
  );

  const chapters = useArticleChapters({
    parent: hasChaptersMode ? initialArticle : null,
    activeChannel,
    pluginMeta,
    capabilities: channelCapabilities,
    storedChannel,
    enabled: hasChaptersMode,
    onChapterDetail: setArticle,
  });

  useEffect(() => {
    setArticle(initialArticle);
    setCoverImageFailed(false);
    setChaptersDrawerOpen(false);
  }, [initialArticle]);

  const channelId = resolveArticleDetailChannel(article, pluginMeta, activeChannel);
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

  const displayContent = useMemo(() => {
    if (!article.content?.trim()) return "";
    let content = article.content;
    if (article.type === "text" && article.image) {
      content = dedupeCoverImageFromContent(article.image, content);
    }
    return prepareArticleHtmlContent(content, runtimeBase, {
      darkTheme: isDarkTheme(theme),
    });
  }, [article.content, article.image, article.type, runtimeBase, theme]);

  useEffect(() => {
    if (displayContent) {
      highlightArticleCode(contentRef.current);
      bindArticleContentImages(contentRef.current, runtimeBase);
      bindArticleContentPlayers(contentRef.current);
    }
    return () => destroyArticleContentPlayers(contentRef.current);
  }, [displayContent, runtimeBase, theme]);

  const showContentLoading = loading
    || chapters.detailLoading
    || (chapters.isActive && chapters.loading);

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

      <div className="flex-1 min-h-0 w-full overflow-y-auto">
          <div
            className="article-reader space-y-6 px-4 pb-5 sm:px-5"
            style={{ "--reader-scale": readerFontScale } as React.CSSProperties}
          >
            <div className="space-y-4">
              {!showRatingHero ? (
              <div className="flex items-start gap-3">
                <h1 className="article-reader-title font-extrabold tracking-tight text-neutral-900 dark:text-white leading-tight flex-1 min-w-0">
                  {article.title}
                </h1>
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
        onClose={() => setChaptersDrawerOpen(false)}
      >
        {chaptersList}
      </ChaptersDrawer>
    </div>
  );
}
