import { useEffect, useRef, useState, type RefObject } from "react";
import { isDarkTheme } from "@/lib/themeMode";
import { ProxiedImage } from "@/components/ProxiedImage";
import { parseRatingScore, ratingDisplayTags } from "@/lib/ratingPlugin";
import {
  DEFAULT_GRID_COVER_ASPECT_RATIO,
  gridCoverAspectCss,
  type GridCoverAspectRatio,
} from "@/lib/gridCoverAspectRatio";
import type { Article, ThemeMode } from "@/types";

const DEFAULT_COLUMN_COUNT = 4;

interface RatingFocusViewProps {
  theme: ThemeMode;
  runtimeBase: string | null;
  articles: Article[];
  columnCount?: number;
  coverAspectRatio?: GridCoverAspectRatio;
  loading: boolean;
  loadingMore: boolean;
  searching?: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onItemSelect?: (article: Article) => void;
  selectedArticleId?: string;
  scrollRootRef?: RefObject<HTMLElement | null>;
}

export function RatingFocusView({
  theme,
  runtimeBase,
  articles,
  columnCount = DEFAULT_COLUMN_COUNT,
  coverAspectRatio = DEFAULT_GRID_COVER_ASPECT_RATIO,
  loading,
  loadingMore,
  searching = false,
  hasMore,
  onLoadMore,
  onItemSelect,
  selectedArticleId,
  scrollRootRef,
}: RatingFocusViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const isDark = isDarkTheme(theme);

  useEffect(() => {
    if (!hasMore || loadingMore || loading || searching) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { root: scrollRootRef?.current ?? null, rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, searching, onLoadMore, articles.length, scrollRootRef]);

  if ((loading || searching) && articles.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
          {searching ? "正在搜索…" : "正在加载频道数据…"}
        </div>
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="text-center py-24">
        <p className="text-sm text-neutral-400">暂无影视数据</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {articles.map(item => {
          const tags = item.tags ?? [];
          const score = parseRatingScore(tags);
          const displayTags = ratingDisplayTags(tags);
          const hasImage = Boolean(item.image?.trim()) && !failedIds.has(item.id);
          const isSelected = selectedArticleId === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemSelect?.(item)}
              className={`group text-left rounded-xl overflow-hidden border transition-all duration-200 ${
                isSelected
                  ? isDark
                    ? "bg-indigo-950/30 border-indigo-700 ring-1 ring-indigo-700/50"
                    : "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200"
                  : isDarkTheme(theme)
                    ? "orbit-surface-elevated border-[var(--orbit-border)] hover:border-violet-700/40"
                    : "bg-white border-neutral-100 hover:border-neutral-200 hover:shadow-md"
              }`}
            >
              <div
                className={`relative w-full overflow-hidden ${
                  isDarkTheme(theme) ? "bg-neutral-800" : "bg-neutral-100"
                }`}
                style={{ aspectRatio: gridCoverAspectCss(coverAspectRatio) }}
              >
                {hasImage ? (
                  <ProxiedImage
                    runtimeBase={runtimeBase}
                    src={item.image!}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    onError={() => {
                      setFailedIds(prev => new Set(prev).add(item.id));
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400 px-2 text-center">
                    {item.title}
                  </div>
                )}
                {score ? (
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[11px] font-semibold text-amber-400 tabular-nums">
                    {score}
                  </div>
                ) : null}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors pointer-events-none" />
              </div>

              <div className="flex-shrink-0 p-2.5 space-y-1">
                <h4
                  className={`text-xs font-semibold leading-5 line-clamp-2 h-10 ${
                    isDarkTheme(theme) ? "text-neutral-100" : "text-neutral-800"
                  }`}
                >
                  {item.title}
                </h4>
                {displayTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1 max-h-5 overflow-hidden">
                    {displayTags.map((tag, idx) => (
                      <span
                        key={idx}
                        className={`px-1.5 py-0.5 rounded text-[10px] leading-4 ${
                          isDark
                            ? "bg-neutral-800/80 text-neutral-400"
                            : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="text-[10px] leading-4 text-neutral-400 line-clamp-2 h-8">
                  {item.summary?.trim() || "\u00A0"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div ref={sentinelRef} className="h-1 w-full shrink-0" aria-hidden />

      {loadingMore ? (
        <div className="flex items-center justify-center py-6">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : null}
    </div>
  );
}
