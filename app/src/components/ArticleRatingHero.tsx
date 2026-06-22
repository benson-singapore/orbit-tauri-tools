import type { ReactNode } from "react";
import { isDarkTheme } from "@/lib/themeMode";
import { Icon } from "@/components/Icon";
import { ProxiedImage } from "@/components/ProxiedImage";
import {
  parseRatingScore,
  parseRatingSummary,
  ratingDisplayTags,
} from "@/lib/ratingPlugin";
import type { Article, ThemeMode } from "@/types";

interface ArticleRatingHeroProps {
  article: Article;
  theme: ThemeMode;
  runtimeBase: string | null;
  trailing?: ReactNode;
  onCoverError?: () => void;
}

export function ArticleRatingHero({
  article,
  theme,
  runtimeBase,
  trailing,
  onCoverError,
}: ArticleRatingHeroProps) {
  const isDark = isDarkTheme(theme);
  const score = parseRatingScore(article.tags ?? []);
  const extraTags = ratingDisplayTags(article.tags ?? []);
  const meta = parseRatingSummary(article.summary ?? "");
  const displayTags = [...meta.genres, ...extraTags];

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
      {article.image?.trim() ? (
        <div className="relative w-[72px] sm:w-[48px] md:w-[54px] shrink-0 mx-auto sm:mx-0">
          <div className="aspect-[2/3] sm:aspect-auto sm:h-[64px] md:h-[72px] overflow-hidden rounded-lg">
            <ProxiedImage
              runtimeBase={runtimeBase}
              src={article.image}
              alt={article.title}
              className="w-full h-full object-cover"
              onError={onCoverError}
            />
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start gap-3">
          <h1 className="article-reader-title font-extrabold tracking-tight text-neutral-900 dark:text-white leading-tight flex-1 min-w-0">
            {article.title}
          </h1>
          {score ? (
            <div className="shrink-0 flex items-center gap-0.5 text-amber-500">
              <Icon name="star" className="w-4 h-4" />
              <span className="text-xl font-bold tabular-nums leading-none">{score}</span>
            </div>
          ) : null}
          {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>

        {displayTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {displayTags.map((tag, idx) => (
              <span
                key={`${tag}-${idx}`}
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
  );
}

export function shouldShowArticleRatingHero(
  article: Article,
  options: {
    isRatingLayout: boolean;
    showArticleMedia: boolean;
    coverImageFailed?: boolean;
  },
): boolean {
  if (options.isRatingLayout) return true;
  if (options.coverImageFailed) return false;
  if (options.showArticleMedia) return false;
  return Boolean(article.image?.trim());
}
