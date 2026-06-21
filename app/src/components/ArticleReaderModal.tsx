import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { ProxiedImage } from "@/components/ProxiedImage";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
import {
  dedupeCoverImageFromContent,
  prepareArticleHtmlContent,
} from "@/lib/articleContent";
import { shouldSkipFeedItemDetailFetch, isRatingPluginArticle } from "@/lib/browseDynamicFeed";
import { highlightArticleCode } from "@/lib/highlightArticleCode";
import { fetchFeedItem } from "@/lib/feed";
import { bindArticleContentImages } from "@/lib/imageProxy";
import { runtimeOpenDetail, shouldUseRuntimeV2 } from "@/lib/runtimeV2";
import { resolveYouTubeVideoId } from "@/lib/youtube";
import type { Article, Plugin, ThemeMode } from "@/types";

interface ArticleReaderModalProps {
  theme: ThemeMode;
  runtimeBase: string | null;
  article: Article;
  readerFontScale: number;
  hasDetail: boolean;
  activeChannel: string;
  pluginMeta?: Plugin;
  onClose: () => void;
}

export function ArticleReaderModal({
  theme,
  runtimeBase,
  article: initialArticle,
  readerFontScale,
  hasDetail,
  activeChannel,
  pluginMeta,
  onClose,
}: ArticleReaderModalProps) {
  const isDark = theme === "dark";
  const panelBg = isDark ? "bg-[#141416] text-white" : "bg-white text-neutral-900";
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
          setArticle(prev => (prev.id === itemId ? { ...prev, ...result.item } : prev));
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
        setArticle(prev => (prev.id === itemId ? { ...prev, ...detail } : prev));
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

  const isRatingCoverLayout = isRatingPluginArticle(article, pluginMeta);

  const showArticleMedia = useMemo(() => {
    if (article.type === "text") {
      return Boolean(article.image?.trim()) && !coverImageFailed;
    }
    if (article.type === "video" || article.type === "audio") {
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
    return prepareArticleHtmlContent(content, runtimeBase);
  }, [article.content, article.image, article.type, runtimeBase]);

  useEffect(() => {
    if (displayContent) {
      highlightArticleCode(contentRef.current);
      bindArticleContentImages(contentRef.current, runtimeBase);
    }
  }, [displayContent, runtimeBase, theme]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleBackdropClick = (event: MouseEvent) => {
    event.stopPropagation();
    onClose();
  };

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className={`relative w-full max-w-4xl h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${panelBg}`}
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="article-reader-modal-title"
      >
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onClose();
          }}
          className={`absolute top-3 right-3 z-10 p-2 rounded-full transition-colors ${
            isDark
              ? "bg-black/40 hover:bg-black/60 text-white/80"
              : "bg-black/20 hover:bg-black/30 text-neutral-600"
          }`}
          aria-label="关闭"
        >
          <Icon name="close" className="w-4 h-4" />
        </button>

        <div
          className="flex-1 min-h-0 overflow-y-auto article-reader px-5 sm:px-8 py-6 sm:py-8"
          style={{ "--reader-scale": readerFontScale } as React.CSSProperties}
        >
          <div className="space-y-4">
            <div className="space-y-2 pr-8">
              <span
                className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                  isDark ? "bg-neutral-800 text-neutral-400" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {article.pluginName}
              </span>
              <h2
                id="article-reader-modal-title"
                className="article-reader-title font-extrabold tracking-tight leading-tight"
              >
                {article.title}
              </h2>
              {article.author ? (
                <p className={`text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                  由 {article.author} 撰写
                </p>
              ) : null}
            </div>

            {showArticleMedia && isRatingCoverLayout && article.type === "text" && article.image?.trim() ? (
              <ProxiedImage
                runtimeBase={runtimeBase}
                src={article.image}
                alt="Article Cover"
                className="h-[380px] w-auto max-w-full object-contain mx-auto block rounded-xl"
                onError={() => setCoverImageFailed(true)}
              />
            ) : showArticleMedia
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
            ) : showArticleMedia ? (
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
                        poster={article.image}
                      />
                    ) : article.image ? (
                      <ProxiedImage
                        runtimeBase={runtimeBase}
                        src={article.image}
                        alt={article.title}
                        className="w-full h-full object-cover opacity-80"
                      />
                    ) : null}
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
              <div className="mt-2 flex items-center gap-2 text-sm text-neutral-400">
                <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
                加载正文中…
              </div>
            ) : displayContent ? (
              <>
                <div
                  ref={contentRef}
                  data-theme={theme}
                  className="article-content mt-2"
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
              <div className="mt-2 border-t border-dashed dark:border-neutral-800 pt-6 space-y-4">
                {article.summary?.trim() ? (
                  <p className={`text-base leading-relaxed italic ${
                    isDark ? "text-neutral-400" : "text-neutral-600"
                  }`}>
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
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
