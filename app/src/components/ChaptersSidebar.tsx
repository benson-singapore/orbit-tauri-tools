import { Icon } from "@/components/Icon";
import type { Article } from "@/types";

interface ChaptersSidebarProps {
  title: string;
  items: Article[];
  loading?: boolean;
  loadingMore?: boolean;
  refreshing?: boolean;
  hasMore?: boolean;
  canLoadMore?: boolean;
  canRefresh?: boolean;
  parentItem: Article;
  activeItemId?: string | null;
  itemLabel?: string;
  theme?: "light" | "dark";
  onSelect: (item: Article) => void;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  onClearAndRefresh?: () => void;
}

export function ChaptersSidebar({
  title,
  items,
  loading = false,
  loadingMore = false,
  refreshing = false,
  hasMore = false,
  canLoadMore = false,
  canRefresh = false,
  parentItem,
  activeItemId,
  itemLabel,
  theme = "light",
  onSelect,
  onLoadMore,
  onRefresh,
  onClearAndRefresh,
}: ChaptersSidebarProps) {
  const heading = title || "目录";
  const busy = loading || refreshing;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className={`p-4 border-b space-y-2 shrink-0 ${
        theme === "dark" ? "border-neutral-800" : "border-neutral-100"
      }`}>
        <div className="min-w-0">
          <p className="text-[11px] text-neutral-400 truncate">{parentItem.title}</p>
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold truncate flex-1 min-w-0">{heading}</h2>
            {(canRefresh || onRefresh || onClearAndRefresh) ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onRefresh?.()}
                  disabled={busy}
                  title="刷新"
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Icon name="refresh" className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => onClearAndRefresh?.()}
                  disabled={busy}
                  title="清空并刷新"
                  className="px-2 py-1 rounded-lg text-[11px] font-medium text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  清空
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
          <span className="truncate">{parentItem.pluginName}</span>
          <span>{busy ? "加载中…" : `共 ${items.length} 篇`}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 no-scrollbar">
        {busy ? (
          <p className="text-sm text-neutral-400 text-center py-8">正在加载目录…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8">暂无条目</p>
        ) : (
          <>
            {items.map((item, index) => {
              const isActive = activeItemId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className={`group relative w-full p-3.5 rounded-2xl text-left transition-all duration-300 border-[0.5px] ${
                    isActive
                      ? "bg-[#e9eef6] dark:bg-neutral-800 border-indigo-300 dark:border-neutral-600 shadow-sm"
                      : "bg-white hover:bg-[#f0f4f9] dark:bg-neutral-900 dark:hover:bg-neutral-800/40 border-neutral-200 dark:border-neutral-700"
                  }`}
                >
                  <div className="flex gap-3 items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[11px] font-medium text-neutral-400">
                          {itemLabel ? `${index + 1}${itemLabel}` : `#${index + 1}`}
                        </span>
                      </div>
                      <h4 className={`text-sm font-semibold leading-snug line-clamp-2 transition-colors ${
                        isActive
                          ? "text-indigo-700 dark:text-indigo-400"
                          : "text-neutral-800 dark:text-neutral-200"
                      }`}>
                        {item.title}
                      </h4>
                      {item.summary?.trim() ? (
                        <p className="text-xs text-neutral-400 dark:text-neutral-500 line-clamp-2 mt-0.5 leading-snug">
                          {item.summary}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {(item.author || item.time) ? (
                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-dashed border-neutral-100 dark:border-neutral-800/80 text-[10px] text-neutral-400">
                      {item.author ? <span>{item.author}</span> : null}
                      {item.author && item.time ? <span>•</span> : null}
                      {item.time ? <span>{item.time}</span> : null}
                    </div>
                  ) : null}
                </button>
              );
            })}
            {canLoadMore && hasMore ? (
              <button
                type="button"
                onClick={() => onLoadMore?.()}
                disabled={loadingMore}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 py-2.5 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {loadingMore ? "加载中…" : "加载更多"}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
