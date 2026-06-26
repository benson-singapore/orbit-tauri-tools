import { ProxiedImage } from "@/components/ProxiedImage";
import { Icon } from "@/components/Icon";
import { renderSocialNoteBody } from "@/lib/socialNoteContent";
import { isLongSocialNote, socialAuthorLabel } from "@/lib/socialPlugin";
import type { Article } from "@/types";

interface SocialFeedCardProps {
  article: Article;
  runtimeBase: string | null;
  isSelected: boolean;
  isUnread: boolean;
  compact?: boolean;
  onSelect?: () => void;
  onBookmark?: (event: React.MouseEvent) => void;
  onIgnore?: (event: React.MouseEvent) => void;
  failedThumbnail?: boolean;
  onThumbnailError?: () => void;
}

function SocialMediaPreview({
  article,
  runtimeBase,
  compact,
}: {
  article: Article;
  runtimeBase: string | null;
  compact?: boolean;
}) {
  const media = article.media ?? [];
  if (media.length === 0) return null;

  const first = media[0];
  if (!first) return null;

  if (first.type === "video") {
    const thumb = first.thumbnail || article.image;
    return (
      <div className={`relative overflow-hidden rounded-xl bg-neutral-900 ${compact ? "mt-2" : "mt-3"}`}>
        {thumb ? (
          <ProxiedImage
            runtimeBase={runtimeBase}
            src={thumb}
            alt=""
            className={`w-full object-cover ${compact ? "max-h-48" : "max-h-72"}`}
          />
        ) : (
          <div className={`w-full bg-neutral-800 ${compact ? "h-40" : "h-52"}`} />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="rounded-full bg-black/60 p-3">
            <Icon name="play" className="w-5 h-5 text-white" />
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
        className={`block overflow-hidden rounded-xl border border-neutral-200/70 dark:border-neutral-700/70 ${compact ? "mt-2" : "mt-3"}`}
      >
        {first.thumbnail ? (
          <ProxiedImage
            runtimeBase={runtimeBase}
            src={first.thumbnail}
            alt=""
            className={`w-full object-cover ${compact ? "max-h-36" : "max-h-48"}`}
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
      <div className={compact ? "mt-2" : "mt-3"}>
        <ProxiedImage
          runtimeBase={runtimeBase}
          src={first.url}
          alt=""
          className={`w-full rounded-xl object-cover ${compact ? "max-h-56" : "max-h-80"}`}
        />
      </div>
    );
  }

  return null;
}

function SocialQuoteCard({
  article,
  runtimeBase,
}: {
  article: Article;
  runtimeBase: string | null;
}) {
  const quote = article.quote;
  if (!quote) return null;
  return (
    <div className="mt-3 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 p-3 bg-neutral-50/60 dark:bg-neutral-900/40">
      <div className="flex items-center gap-2 mb-2">
        {quote.authorAvatar ? (
          <ProxiedImage
            runtimeBase={runtimeBase}
            src={quote.authorAvatar}
            alt=""
            className="w-6 h-6 rounded-full object-cover"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate">{quote.author}</p>
          {quote.authorHandle ? (
            <p className="text-[10px] text-neutral-500 truncate">@{quote.authorHandle}</p>
          ) : null}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 line-clamp-4">
        {quote.body}
      </p>
    </div>
  );
}

export function SocialFeedCard({
  article,
  runtimeBase,
  isSelected,
  isUnread,
  compact = false,
  onSelect,
  onBookmark,
  onIgnore,
  failedThumbnail,
  onThumbnailError,
}: SocialFeedCardProps) {
  const showFullBody = !compact && !isLongSocialNote(article);
  const body = showFullBody ? renderSocialNoteBody(article) : (
    <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-4">
      {article.summary || article.title}
    </p>
  );

  return (
    <div
      onClick={onSelect}
      className={`group relative p-3.5 rounded-2xl cursor-pointer transition-all duration-300 border-[0.5px] orbit-feed-card ${
        isSelected ? "orbit-feed-card--selected" : ""
      }`}
    >
      <div className="flex gap-3 items-start">
        {article.authorAvatar ? (
          <ProxiedImage
            runtimeBase={runtimeBase}
            src={article.authorAvatar}
            alt={article.author}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            onError={onThumbnailError}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-neutral-300 dark:bg-neutral-700 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold truncate">{article.author}</span>
            <span className="text-xs orbit-feed-card-meta truncate">{socialAuthorLabel(article)}</span>
            <span className="text-xs orbit-feed-card-meta">· {article.time}</span>
            {isUnread ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" title="未读" />
            ) : null}
          </div>

          {body}
          <SocialQuoteCard article={article} runtimeBase={runtimeBase} />
          <SocialMediaPreview article={article} runtimeBase={runtimeBase} compact={compact || isLongSocialNote(article)} />

          {isLongSocialNote(article) ? (
            <p className="mt-2 text-xs text-[var(--orbit-accent)]">点击查看全文</p>
          ) : null}
        </div>

        {!showFullBody && article.image?.trim() && !failedThumbnail ? (
          <ProxiedImage
            runtimeBase={runtimeBase}
            src={article.image}
            alt=""
            className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
            onError={onThumbnailError}
          />
        ) : null}
      </div>

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-dashed orbit-feed-card-divider text-[10px] orbit-feed-card-meta">
        <div className="flex items-center gap-3">
          {article.stats?.likes ? <span>♥ {article.stats.likes}</span> : null}
          {article.stats?.replies ? <span>💬 {article.stats.replies}</span> : null}
          {article.stats?.restacks ? <span>↗ {article.stats.restacks}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {onIgnore ? (
            <button
              onClick={onIgnore}
              className="p-1 orbit-feed-card-action rounded-full"
              title="忽略"
              type="button"
            >
              <Icon name="eye-off" className="w-3 h-3 orbit-feed-card-meta" />
            </button>
          ) : null}
          {onBookmark ? (
            <button
              onClick={onBookmark}
              className="p-1 orbit-feed-card-action rounded-full"
              title="收藏"
              type="button"
            >
              <Icon name="bookmark" className="w-3 h-3 orbit-feed-card-meta" active={article.isBookmarked} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
