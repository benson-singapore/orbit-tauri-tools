import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { ProxiedImage } from "@/components/ProxiedImage";
import { useVideoSessionMountRegistry } from "@/components/VideoWallMountContext";
import {
  dedupeCoverImageFromContent,
  prepareArticleHtmlContent,
} from "@/lib/articleContent";
import { stripEmbeddedVideosFromContent } from "@/lib/articleVideoUrl";
import { shouldSkipFeedItemDetailFetch, isRatingPluginArticle } from "@/lib/browseDynamicFeed";
import { highlightArticleCode } from "@/lib/highlightArticleCode";
import { fetchFeedItem } from "@/lib/feed";
import { bindArticleContentImages } from "@/lib/imageProxy";
import {
  parseRatingScore,
  parseRatingSummary,
  ratingDisplayTags,
} from "@/lib/ratingPlugin";
import { runtimeOpenDetail, shouldUseRuntimeV2 } from "@/lib/runtimeV2";
import { isVideoArticle } from "@/lib/readerSessionVideos";
import type { Article, Plugin, ThemeMode } from "@/types";

interface ArticleDetailPanelProps {
  sessionId: string;
  theme: ThemeMode;
  runtimeBase: string | null;
  article: Article;
  readerFontScale: number;
  hasDetail: boolean;
  activeChannel: string;
  pluginMeta?: Plugin;
}

function MetaRow({
  label,
  children,
  isDark,
}: {
  label: string;
  children: ReactNode;
  isDark: boolean;
}) {
  return (
    <div className="flex gap-3 text-sm leading-relaxed">
      <span
        className={`shrink-0 w-9 text-right text-xs font-medium tracking-wide ${
          isDark ? "text-neutral-500" : "text-neutral-400"
        }`}
      >
        {label}
      </span>
      <div className={`flex-1 min-w-0 ${isDark ? "text-neutral-200" : "text-neutral-700"}`}>
        {children}
      </div>
    </div>
  );
}

export function ArticleDetailPanel({
  sessionId,
  theme,
  runtimeBase,
  article: initialArticle,
  readerFontScale,
  hasDetail,
  activeChannel,
  pluginMeta,
}: ArticleDetailPanelProps) {
  const isDark = theme === "dark";
  const [article, setArticle] = useState(initialArticle);
  const [loading, setLoading] = useState(false);
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setArticle(initialArticle);
    setCoverImageFailed(false);
  }, [initialArticle]);

  useEffect(() => {
    const itemId = article.id;
    if (shouldSkipFeedItemDetailFetch(article, pluginMeta, hasDetail)) {
      setLoading(false);
      return;
    }

    const channelId = article.channelId ?? activeChannel;
    if (shouldUseRuntimeV2(article.pluginId, pluginMeta) && channelId !== "all" && hasDetail) {
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
  }, [article.id, article.pluginId, article.channelId, pluginMeta, hasDetail, activeChannel]);

  const isRatingLayout = isRatingPluginArticle(article, pluginMeta);
  const hasVideoMedia = isVideoArticle(article);
  const { registerMount } = useVideoSessionMountRegistry();

  const videoMountRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (hasVideoMedia) {
        registerMount(sessionId, "modal", element);
        return;
      }
      registerMount(sessionId, "modal", null);
    },
    [registerMount, sessionId, hasVideoMedia],
  );

  const displayContent = useMemo(() => {
    if (!article.content?.trim()) return "";
    let content = article.content;
    if (article.type === "text" && article.image) {
      content = dedupeCoverImageFromContent(article.image, content);
    }
    if (hasVideoMedia) {
      content = stripEmbeddedVideosFromContent(content);
    }
    return prepareArticleHtmlContent(content, runtimeBase);
  }, [article.content, article.image, article.type, runtimeBase, hasVideoMedia]);

  useEffect(() => {
    if (displayContent) {
      highlightArticleCode(contentRef.current);
      bindArticleContentImages(contentRef.current, runtimeBase);
    }
  }, [displayContent, runtimeBase, theme]);

  const score = parseRatingScore(article.tags ?? []);
  const extraTags = ratingDisplayTags(article.tags ?? []);
  const meta = useMemo(
    () => parseRatingSummary(article.summary ?? ""),
    [article.summary],
  );

  const hasStructuredMeta =
    meta.year
    || meta.region
    || meta.genres.length > 0
    || meta.director
    || meta.cast.length > 0;

  if (isRatingLayout) {
    return (
      <div
        className="article-reader h-full min-h-0 overflow-y-auto px-4 pb-5 sm:px-5"
        style={{ "--reader-scale": readerFontScale } as React.CSSProperties}
      >
        <div className="flex flex-col sm:flex-row gap-4">
          {article.image?.trim() ? (
            <div className="relative sm:w-[140px] lg:w-[156px] shrink-0 mx-auto sm:mx-0">
              <div className="aspect-[2/3] sm:aspect-auto sm:h-full sm:min-h-[220px] overflow-hidden rounded-xl">
                <ProxiedImage
                  runtimeBase={runtimeBase}
                  src={article.image}
                  alt={article.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          ) : null}

          <div className="flex-1 min-w-0 space-y-3">
            <div className="space-y-2">
              <span
                className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                  isDark ? "bg-neutral-800 text-neutral-400" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {article.pluginName}
              </span>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg sm:text-xl font-bold leading-tight tracking-tight">
                  {article.title}
                </h2>
                {score ? (
                  <div className="shrink-0 flex items-center gap-0.5 text-amber-500">
                    <Icon name="star" className="w-4 h-4" />
                    <span className="text-xl font-bold tabular-nums leading-none">{score}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {hasStructuredMeta ? (
              <div className="space-y-2.5">
                {meta.year || meta.region ? (
                  <p className={`text-sm ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                    {[meta.year, meta.region].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {meta.genres.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {meta.genres.map(genre => (
                      <span
                        key={genre}
                        className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                          isDark
                            ? "bg-indigo-950/60 text-indigo-300"
                            : "bg-indigo-50 text-indigo-600"
                        }`}
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                ) : null}
                {meta.director ? (
                  <MetaRow label="导演" isDark={isDark}>{meta.director}</MetaRow>
                ) : null}
                {meta.cast.length > 0 ? (
                  <MetaRow label="主演" isDark={isDark}>
                    <span className="flex flex-wrap gap-x-1 gap-y-0.5">
                      {meta.cast.map((name, idx) => (
                        <span key={name}>
                          {idx > 0 ? (
                            <span className={isDark ? "text-neutral-600" : "text-neutral-300"}>
                              {" / "}
                            </span>
                          ) : null}
                          {name}
                        </span>
                      ))}
                    </span>
                  </MetaRow>
                ) : null}
              </div>
            ) : meta.fallback ? (
              <p className={`text-sm leading-relaxed ${isDark ? "text-neutral-300" : "text-neutral-600"}`}>
                {meta.fallback}
              </p>
            ) : null}

            {extraTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {extraTags.map((tag, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded-md text-xs ${
                      isDark
                        ? "bg-neutral-800 text-neutral-400"
                        : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-neutral-400">
            <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
            加载详情中…
          </div>
        ) : displayContent ? (
          <div
            ref={contentRef}
            data-theme={theme}
            className={`article-content text-sm mt-4 pt-4 border-t ${
              isDark ? "border-neutral-800" : "border-neutral-100"
            }`}
            dangerouslySetInnerHTML={{ __html: displayContent }}
          />
        ) : null}

        {article.sourceUrl ? (
          <div className="mt-5">
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                isDark
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              在 {article.pluginName} 查看详情
              <Icon name="share" className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  const showCoverImage =
    Boolean(article.image?.trim())
    && !coverImageFailed
    && (article.type === "text" || article.type === "image");

  return (
    <div
      className="article-reader h-full min-h-0 overflow-y-auto px-4 pb-5 sm:px-5"
      style={{ "--reader-scale": readerFontScale } as React.CSSProperties}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <span
            className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${
              isDark ? "bg-neutral-800 text-neutral-400" : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {article.pluginName}
          </span>
          <h2 className="article-reader-title font-extrabold tracking-tight leading-tight">
            {article.title}
          </h2>
          {article.author ? (
            <p className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
              由 {article.author} 撰写
            </p>
          ) : null}
        </div>

        {hasVideoMedia ? (
          <div
            ref={videoMountRef}
            className="relative aspect-video w-full rounded-xl overflow-hidden bg-neutral-950"
          />
        ) : showCoverImage ? (
          <ProxiedImage
            runtimeBase={runtimeBase}
            src={article.image!}
            alt={article.title}
            className="rounded-xl w-full max-h-80 object-contain mx-auto"
            onError={() => setCoverImageFailed(true)}
          />
        ) : null}

        {(article.tags ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {(article.tags ?? []).map((tag, index) => (
              <span
                key={index}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  isDark
                    ? "bg-neutral-800 text-neutral-400"
                    : "bg-neutral-100 text-neutral-600"
                }`}
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
            加载正文中…
          </div>
        ) : displayContent ? (
          <>
            <div
              ref={contentRef}
              data-theme={theme}
              className="article-content"
              dangerouslySetInnerHTML={{ __html: displayContent }}
            />
            {article.sourceUrl ? (
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:underline dark:text-indigo-400"
              >
                阅读原文 →
              </a>
            ) : null}
          </>
        ) : article.summary?.trim() ? (
          <p className={`text-base leading-relaxed italic ${
            isDark ? "text-neutral-400" : "text-neutral-600"
          }`}>
            “ {article.summary} ”
          </p>
        ) : null}
      </div>
    </div>
  );
}
