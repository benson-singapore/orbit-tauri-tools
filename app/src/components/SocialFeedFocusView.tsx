import { useEffect, useRef, type RefObject } from "react";
import { Icon } from "@/components/Icon";
import { ProxiedImage } from "@/components/ProxiedImage";
import { renderSocialNoteBody } from "@/lib/socialNoteContent";
import { isLongSocialNote, socialAuthorLabel } from "@/lib/socialPlugin";
import { socialFeedWidthCssValue } from "@/lib/socialFeedWidth";
import { isDarkTheme } from "@/lib/themeMode";
import type { Article, ThemeMode } from "@/types";

interface SocialFeedFocusViewProps {
  theme: ThemeMode;
  runtimeBase: string | null;
  articles: Article[];
  feedWidthPercent?: number;
  loading: boolean;
  loadingMore: boolean;
  searching?: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onItemSelect?: (article: Article) => void;
  onBookmark?: (article: Article, event: React.MouseEvent) => void;
  onIgnore?: (article: Article, event: React.MouseEvent) => void;
  scrollRootRef?: RefObject<HTMLElement | null>;
}

function SocialTimelineMedia({
  article,
  runtimeBase,
}: {
  article: Article;
  runtimeBase: string | null;
}) {
  const media = article.media ?? [];
  if (media.length === 0) return null;

  const first = media[0];
  if (!first) return null;

  if (first.type === "video") {
    const thumb = first.thumbnail || article.image;
    return (
      <div className="relative mt-3 overflow-hidden rounded-xl bg-neutral-900">
        {thumb ? (
          <ProxiedImage
            runtimeBase={runtimeBase}
            src={thumb}
            alt=""
            className="w-full max-h-[28rem] object-cover"
          />
        ) : (
          <div className="h-56 w-full bg-neutral-800" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="rounded-full bg-black/60 p-3">
            <Icon name="play" className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>
    );
  }

  if (first.type === "link") {
    return (
      <a
        href={first.url}
        target="_blank"
        rel="noreferrer"
        onClick={event => event.stopPropagation()}
        className="mt-3 block overflow-hidden rounded-xl border border-neutral-200/70 dark:border-neutral-700/70"
      >
        {first.thumbnail ? (
          <ProxiedImage
            runtimeBase={runtimeBase}
            src={first.thumbnail}
            alt=""
            className="max-h-48 w-full object-cover"
          />
        ) : null}
        {first.title ? (
          <div className="px-3 py-2 text-xs font-medium line-clamp-2">{first.title}</div>
        ) : null}
      </a>
    );
  }

  if (first.type === "image" && first.url) {
    return (
      <div className="mt-3">
        <ProxiedImage
          runtimeBase={runtimeBase}
          src={first.url}
          alt=""
          className="max-h-[32rem] w-full rounded-xl object-cover"
        />
      </div>
    );
  }

  return null;
}

function SocialTimelineQuote({
  article,
  runtimeBase,
}: {
  article: Article;
  runtimeBase: string | null;
}) {
  const quote = article.quote;
  if (!quote) return null;

  return (
    <div className="mt-3 rounded-xl border border-neutral-200/80 p-3 dark:border-neutral-700/80 dark:bg-neutral-900/40">
      <div className="mb-2 flex items-center gap-2">
        {quote.authorAvatar ? (
          <ProxiedImage
            runtimeBase={runtimeBase}
            src={quote.authorAvatar}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <div className="h-6 w-6 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{quote.author}</p>
          {quote.authorHandle ? (
            <p className="truncate text-[10px] text-neutral-500">@{quote.authorHandle}</p>
          ) : null}
        </div>
      </div>
      <p className="line-clamp-4 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
        {quote.body}
      </p>
    </div>
  );
}

function SocialTimelineItem({
  article,
  runtimeBase,
  isDark,
  onSelect,
  onBookmark,
  onIgnore,
}: {
  article: Article;
  runtimeBase: string | null;
  isDark: boolean;
  onSelect?: () => void;
  onBookmark?: (event: React.MouseEvent) => void;
  onIgnore?: (event: React.MouseEvent) => void;
}) {
  const longNote = isLongSocialNote(article);
  const isUnread = !article.isRead;

  return (
    <article
      onClick={onSelect}
      className={`cursor-pointer px-4 py-5 transition-colors sm:px-5 ${
        isDark
          ? "border-b border-neutral-800/90 hover:bg-neutral-900/35"
          : "border-b border-neutral-200/90 hover:bg-neutral-50/80"
      }`}
    >
      <header className="flex items-start gap-3">
        {article.authorAvatar ? (
          <ProxiedImage
            runtimeBase={runtimeBase}
            src={article.authorAvatar}
            alt={article.author}
            className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="truncate text-sm font-semibold">{article.author}</span>
                {article.authorHandle ? (
                  <span className="truncate text-xs text-neutral-500">{socialAuthorLabel(article)}</span>
                ) : null}
                <span className="text-xs text-neutral-500">· {article.time}</span>
                {isUnread ? (
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" title="未读" />
                ) : null}
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-1">
              {onIgnore ? (
                <button
                  type="button"
                  onClick={onIgnore}
                  className="rounded-full p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                  title="忽略"
                >
                  <Icon name="eye-off" className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {onBookmark ? (
                <button
                  type="button"
                  onClick={onBookmark}
                  className="rounded-full p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                  title="收藏"
                >
                  <Icon name="bookmark" className="h-3.5 w-3.5" active={article.isBookmarked} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-2">
            {longNote ? (
              <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed">
                {article.summary || article.title}
              </p>
            ) : (
              renderSocialNoteBody(article)
            )}
          </div>

          <SocialTimelineQuote article={article} runtimeBase={runtimeBase} />
          <SocialTimelineMedia article={article} runtimeBase={runtimeBase} />

          {longNote ? (
            <p className="mt-2 text-xs font-medium text-[var(--orbit-accent)]">查看全文</p>
          ) : null}

          <footer className="mt-3 flex items-center gap-5 text-xs text-neutral-500">
            {article.stats?.likes ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>♥</span>
                {article.stats.likes}
              </span>
            ) : null}
            {article.stats?.replies ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>💬</span>
                {article.stats.replies}
              </span>
            ) : null}
            {article.stats?.restacks ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>↗</span>
                {article.stats.restacks}
              </span>
            ) : null}
            {article.sourceUrl ? (
              <span className="ml-auto inline-flex items-center gap-1 opacity-70">
                <Icon name="share" className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </footer>
        </div>
      </header>
    </article>
  );
}

export function SocialFeedFocusView({
  theme,
  runtimeBase,
  articles,
  feedWidthPercent = 70,
  loading,
  loadingMore,
  searching = false,
  hasMore,
  onLoadMore,
  onItemSelect,
  onBookmark,
  onIgnore,
  scrollRootRef,
}: SocialFeedFocusViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
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

  if (loading || searching) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-500" />
          {searching ? "正在搜索…" : "正在加载推文…"}
        </div>
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-neutral-400">暂无推文</p>
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-full"
      style={{ width: socialFeedWidthCssValue(feedWidthPercent) }}
    >
      {articles.map(article => (
        <SocialTimelineItem
          key={article.id}
          article={article}
          runtimeBase={runtimeBase}
          isDark={isDark}
          onSelect={() => onItemSelect?.(article)}
          onBookmark={onBookmark ? event => {
            event.stopPropagation();
            onBookmark(article, event);
          } : undefined}
          onIgnore={onIgnore ? event => {
            event.stopPropagation();
            onIgnore(article, event);
          } : undefined}
        />
      ))}

      <div ref={sentinelRef} className="h-1" aria-hidden />

      {loadingMore ? (
        <div className="flex items-center justify-center py-6 text-xs text-neutral-400">
          <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-500" />
          加载更多…
        </div>
      ) : null}
    </div>
  );
}
