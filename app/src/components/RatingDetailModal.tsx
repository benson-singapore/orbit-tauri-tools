import { useEffect, useMemo, useRef, type MouseEvent, type ReactNode } from "react";
import { articleContentTheme, isDarkTheme } from "@/lib/themeMode";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { ProxiedImage } from "@/components/ProxiedImage";
import { highlightArticleCode } from "@/lib/highlightArticleCode";
import { prepareArticleHtmlContent } from "@/lib/articleContent";
import { bindArticleContentImages } from "@/lib/imageProxy";
import {
  bindArticleContentPlayers,
  destroyArticleContentPlayers,
} from "@/lib/articleContentPlayer";
import {
  parseRatingScore,
  parseRatingSummary,
  ratingDisplayTags,
} from "@/lib/ratingPlugin";
import type { Article, ThemeMode } from "@/types";

interface RatingDetailModalProps {
  theme: ThemeMode;
  runtimeBase: string | null;
  article: Article;
  onClose: () => void;
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

export function RatingDetailModal({
  theme,
  runtimeBase,
  article,
  onClose,
}: RatingDetailModalProps) {
  const isDark = isDarkTheme(theme);
  const panelBg = isDark ? "bg-[#141416] text-white" : "bg-white text-neutral-900";
  const contentRef = useRef<HTMLDivElement>(null);

  const score = parseRatingScore(article.tags ?? []);
  const extraTags = ratingDisplayTags(article.tags ?? []);
  const meta = useMemo(
    () => parseRatingSummary(article.summary ?? ""),
    [article.summary],
  );

  const displayContent = useMemo(() => {
    const raw = article.content?.trim();
    if (!raw) return "";
    return prepareArticleHtmlContent(raw, runtimeBase, {
      darkTheme: isDarkTheme(theme),
    });
  }, [article.content, runtimeBase, theme]);

  useEffect(() => {
    if (displayContent) {
      highlightArticleCode(contentRef.current);
      bindArticleContentImages(contentRef.current, runtimeBase);
      bindArticleContentPlayers(contentRef.current);
    }
    return () => destroyArticleContentPlayers(contentRef.current);
  }, [displayContent, runtimeBase, theme]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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

  const hasStructuredMeta =
    meta.year
    || meta.region
    || meta.genres.length > 0
    || meta.director
    || meta.cast.length > 0;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className={`relative w-full max-w-2xl max-h-[min(720px,90vh)] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${panelBg}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rating-detail-title"
      >
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onClose();
          }}
          className={`absolute top-3 right-3 z-10 p-2 rounded-full transition-colors ${
            isDark
              ? "bg-black/40 hover:bg-black/60 text-white/80"
              : "bg-black/20 hover:bg-black/30 text-white"
          }`}
          aria-label="关闭"
        >
          <Icon name="close" className="w-4 h-4" />
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col sm:flex-row">
            {article.image?.trim() ? (
              <div className="relative sm:w-[168px] lg:w-[180px] shrink-0">
                <div className="aspect-[2/3] sm:aspect-auto sm:h-full sm:min-h-[270px] overflow-hidden">
                  <ProxiedImage
                    runtimeBase={runtimeBase}
                    src={article.image}
                    alt={article.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent sm:hidden pointer-events-none" />
              </div>
            ) : null}

            <div className="flex-1 min-w-0 p-5 sm:py-6 sm:pr-6 sm:pl-5 space-y-4">
              <div className="space-y-3">
                <span
                  className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    isDark
                      ? "bg-neutral-800 text-neutral-400"
                      : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {article.pluginName}
                </span>

                <div className="flex items-start justify-between gap-4 pr-8">
                  <h2
                    id="rating-detail-title"
                    className="text-xl sm:text-2xl font-bold leading-tight tracking-tight"
                  >
                    {article.title}
                  </h2>
                  {score ? (
                    <div className="shrink-0 text-center">
                      <div className="flex items-center justify-center gap-0.5 text-amber-500">
                        <Icon name="star" className="w-4 h-4" />
                        <span className="text-2xl font-bold tabular-nums leading-none">
                          {score}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {hasStructuredMeta ? (
                <div className="space-y-3">
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
                    <MetaRow label="导演" isDark={isDark}>
                      {meta.director}
                    </MetaRow>
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

              {displayContent ? (
                <div
                  ref={contentRef}
                  data-theme={articleContentTheme(theme)}
                  className={`article-content text-sm pt-4 border-t ${
                    isDark ? "border-neutral-800" : "border-neutral-100"
                  }`}
                  dangerouslySetInnerHTML={{ __html: displayContent }}
                />
              ) : null}
            </div>
          </div>
        </div>

        {article.sourceUrl ? (
          <div
            className={`shrink-0 px-5 py-3.5 border-t ${
              isDark ? "border-neutral-800 bg-neutral-900/40" : "border-neutral-100 bg-neutral-50/80"
            }`}
          >
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${
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
    </div>
  );

  return createPortal(modal, document.body);
}
