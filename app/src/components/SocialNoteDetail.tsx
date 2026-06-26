import { ProxiedImage } from "@/components/ProxiedImage";
import { SocialVideoPlayer } from "@/components/SocialVideoPlayer";
import { renderSocialNoteBody } from "@/lib/socialNoteContent";
import { resolveSocialVideoUrl, socialAuthorLabel } from "@/lib/socialPlugin";
import type { Article } from "@/types";

interface SocialNoteDetailProps {
  article: Article;
  runtimeBase: string | null;
}

function SocialDetailMedia({
  article,
  runtimeBase,
}: {
  article: Article;
  runtimeBase: string | null;
}) {
  const media = article.media ?? [];
  if (!media.length) return null;

  return (
    <div className="space-y-3 mt-4">
      {media.map((item, index) => {
        if (item.type === "image" && item.url) {
          return (
            <ProxiedImage
              key={`img-${index}`}
              runtimeBase={runtimeBase}
              src={item.url}
              alt=""
              className="w-full rounded-xl object-cover max-h-[32rem]"
            />
          );
        }
        if (item.type === "video") {
          const videoUrl = resolveSocialVideoUrl(item);
          if (!videoUrl) return null;
          return (
            <SocialVideoPlayer
              key={`video-${index}`}
              videoUrl={videoUrl}
              poster={item.thumbnail || article.image}
            />
          );
        }
        if (item.type === "link") {
          return (
            <a
              key={`link-${index}`}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl border border-neutral-200/70 dark:border-neutral-700/70"
            >
              {item.thumbnail ? (
                <ProxiedImage
                  runtimeBase={runtimeBase}
                  src={item.thumbnail}
                  alt=""
                  className="w-full object-cover max-h-56"
                />
              ) : null}
              <div className="px-4 py-3">
                <p className="text-sm font-medium">{item.title || item.url}</p>
                {item.url ? <p className="text-xs text-neutral-500 mt-1 truncate">{item.url}</p> : null}
              </div>
            </a>
          );
        }
        return null;
      })}
    </div>
  );
}

export function SocialNoteDetail({ article, runtimeBase }: SocialNoteDetailProps) {
  return (
    <article className="max-w-2xl mx-auto py-4">
      <header className="flex items-start gap-3">
        {article.authorAvatar ? (
          <ProxiedImage
            runtimeBase={runtimeBase}
            src={article.authorAvatar}
            alt={article.author}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{article.author}</h2>
          <p className="text-sm text-neutral-500">{socialAuthorLabel(article)} · {article.time}</p>
        </div>
      </header>

      <div className="mt-4">
        {renderSocialNoteBody(article)}
      </div>

      {article.quote ? (
        <div className="mt-4 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 p-4 bg-neutral-50/60 dark:bg-neutral-900/40">
          <div className="flex items-center gap-2 mb-2">
            {article.quote.authorAvatar ? (
              <ProxiedImage
                runtimeBase={runtimeBase}
                src={article.quote.authorAvatar}
                alt=""
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : null}
            <div>
              <p className="text-sm font-semibold">{article.quote.author}</p>
              {article.quote.authorHandle ? (
                <p className="text-xs text-neutral-500">@{article.quote.authorHandle}</p>
              ) : null}
            </div>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{article.quote.body}</p>
        </div>
      ) : null}

      <SocialDetailMedia article={article} runtimeBase={runtimeBase} />

      <div className="mt-6 flex items-center gap-4 text-sm text-neutral-500">
        {article.stats?.likes ? <span>♥ {article.stats.likes}</span> : null}
        {article.stats?.replies ? <span>💬 {article.stats.replies}</span> : null}
        {article.stats?.restacks ? <span>↗ {article.stats.restacks}</span> : null}
      </div>

      {article.sourceUrl ? (
        <a
          href={article.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-6 text-sm text-[var(--orbit-accent)] hover:underline"
        >
          在 Substack 打开
        </a>
      ) : null}
    </article>
  );
}
