import { useEffect, useRef, useState, type RefObject } from "react";
import { ProxiedImage } from "@/components/ProxiedImage";
import { parseRatingScore } from "@/lib/ratingPlugin";
import type { Article, ThemeMode } from "@/types";

const DEFAULT_COLUMN_COUNT = 4;

interface RatingFocusViewProps {
  theme: ThemeMode;
  runtimeBase: string | null;
  articles: Article[];
  columnCount?: number;
  loading: boolean;
  loadingMore: boolean;
  searching?: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onItemSelect?: (article: Article) => void;
  scrollRootRef?: RefObject<HTMLElement | null>;
}

export function RatingFocusView({
  theme,
  runtimeBase,
  articles,
  columnCount = DEFAULT_COLUMN_COUNT,
  loading,
  loadingMore,
  searching = false,
  hasMore,
  onLoadMore,
  onItemSelect,
  scrollRootRef,
}: RatingFocusViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

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
          {searching ? "正在搜索…" : "正在加载榜单…"}
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
          const score = parseRatingScore(item.tags ?? []);
          const hasImage = Boolean(item.image?.trim()) && !failedIds.has(item.id);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemSelect?.(item)}
              className={`group text-left rounded-xl overflow-hidden border transition-all duration-200 ${
                theme === "dark"
                  ? "bg-[#1c1d1f] border-neutral-800 hover:border-neutral-600"
                  : "bg-white border-neutral-100 hover:border-neutral-200 hover:shadow-md"
              }`}
            >
              <div
                className={`relative aspect-video w-full overflow-hidden ${
                  theme === "dark" ? "bg-neutral-800" : "bg-neutral-100"
                }`}
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
                    theme === "dark" ? "text-neutral-100" : "text-neutral-800"
                  }`}
                >
                  {item.title}
                </h4>
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
