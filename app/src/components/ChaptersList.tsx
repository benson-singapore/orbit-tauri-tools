import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { isDarkTheme } from "@/lib/themeMode";
import type { Article, ThemeMode } from "@/types";

interface ChaptersListProps {
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
  theme?: ThemeMode;
  variant?: "sidebar" | "inline";
  onSelect: (item: Article) => void;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  onClearAndRefresh?: () => void;
}

export function ChaptersList({
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
  variant = "inline",
  onSelect,
  onLoadMore,
  onRefresh,
  onClearAndRefresh,
}: ChaptersListProps) {
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeItemId]);

  const heading = title || "目录";
  const busy = loading || refreshing;
  const isDark = isDarkTheme(theme);
  const isSidebar = variant === "sidebar";
  const sortedItems = useMemo(
    () => (sortOrder === "asc" ? items : [...items].reverse()),
    [items, sortOrder],
  );
  const sortTitle = sortOrder === "asc" ? "排序：正序" : "排序：倒序";

  const header = (
    <div
      className={
        isSidebar
          ? "orbit-chapters-list-header p-4 border-b space-y-2 shrink-0"
          : "space-y-2"
      }
    >
      <div className="min-w-0">
        <p className="text-[11px] orbit-text-subtle truncate">{parentItem.title}</p>
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold truncate flex-1 min-w-0">{heading}</h2>
          {(canRefresh || onRefresh || onClearAndRefresh) ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setSortOrder(current => (current === "asc" ? "desc" : "asc"))}
                title={sortTitle}
                aria-label={sortTitle}
                className="orbit-chapters-list-action p-1.5 rounded-lg"
              >
                <Icon
                  name="sort-vertical"
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    sortOrder === "desc" ? "rotate-180" : ""
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={() => onRefresh?.()}
                disabled={busy}
                title="刷新"
                className="orbit-chapters-list-action p-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="refresh" className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => onClearAndRefresh?.()}
                disabled={busy}
                title="清空并刷新"
                className="orbit-chapters-list-action px-2 py-1 rounded-lg text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                清空
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs orbit-text-subtle px-1">
        <span className="truncate">{parentItem.pluginName}</span>
        <span>{busy ? "加载中…" : `共 ${items.length} 篇`}</span>
      </div>
    </div>
  );

  const listBody = busy ? (
    <p className="text-sm orbit-text-muted text-center py-6">正在加载目录…</p>
  ) : sortedItems.length === 0 ? (
    <p className="text-sm orbit-text-muted text-center py-6">暂无条目</p>
  ) : (
    <>
      {sortedItems.map((item, index) => {
        const isActive = activeItemId === item.id;
        return (
          <button
            key={item.id}
            ref={isActive ? activeItemRef : undefined}
            type="button"
            onClick={() => onSelect(item)}
            className={`group relative w-full p-3.5 rounded-2xl text-left transition-all duration-300 border-[0.5px] orbit-feed-card ${
              isActive ? "orbit-feed-card--selected" : ""
            }`}
          >
            <div className="flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[11px] font-medium orbit-text-subtle">
                    {itemLabel ? `${index + 1}${itemLabel}` : `#${index + 1}`}
                  </span>
                </div>
                <h4
                  className={`text-sm font-semibold leading-snug line-clamp-2 transition-colors ${
                    isActive ? "orbit-feed-card-title--selected" : "orbit-feed-card-title"
                  }`}
                >
                  {item.title}
                </h4>
                {item.summary?.trim() ? (
                  <p className="text-xs orbit-feed-card-summary line-clamp-2 mt-0.5 leading-snug">
                    {item.summary}
                  </p>
                ) : null}
              </div>
            </div>
            {(item.author || item.time) ? (
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-dashed orbit-feed-card-divider text-[10px] orbit-feed-card-meta">
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
          className="orbit-chapters-list-load-more w-full rounded-xl border py-2.5 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loadingMore ? "加载中…" : "加载更多"}
        </button>
      ) : null}
    </>
  );

  if (isSidebar) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {header}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 no-scrollbar">
          {listBody}
        </div>
      </div>
    );
  }

  return (
    <section
      className={`rounded-2xl border p-4 space-y-3 ${
        isDark
          ? "orbit-chapters-list-header"
          : "border-neutral-200 bg-neutral-50/80"
      }`}
      style={isDark ? { background: "var(--orbit-card)" } : undefined}
    >
      {header}
      <div className="space-y-3 max-h-[min(40vh,420px)] overflow-y-auto no-scrollbar">
        {listBody}
      </div>
    </section>
  );
}
