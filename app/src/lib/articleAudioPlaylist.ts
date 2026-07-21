import type { ReaderAudioTrack } from "@/components/ReaderAudioPlayer";
import {
  PENDING_AUDIO_TRACK_URL,
  resolveArticleAudioUrl,
} from "@/lib/articleAudioUrl";
import type { Article } from "@/types";

export interface ArticleCoverImageContext {
  listArticles?: Array<Pick<Article, "id" | "image">>;
  parentArticle?: Pick<Article, "image"> | null;
}

export function resolveArticleCoverImage(
  article: Pick<Article, "id" | "image">,
  context?: ArticleCoverImageContext,
): string | undefined {
  const direct = article.image?.trim();
  if (direct) return direct;

  const fromList = context?.listArticles
    ?.find(item => item.id === article.id)
    ?.image?.trim();
  if (fromList) return fromList;

  const fromParent = context?.parentArticle?.image?.trim();
  if (fromParent) return fromParent;

  return undefined;
}

export function filterArticlesWithAudio(articles: Article[]): Article[] {
  return articles.filter(article => resolveArticleAudioUrl(article) !== null);
}

export function articleToAudioTrack(
  article: Article,
  _runtimeBase: string | null,
  context?: ArticleCoverImageContext,
): ReaderAudioTrack | null {
  const url = resolveArticleAudioUrl(article);
  if (!url) return null;

  return {
    name: article.title,
    artist: article.author?.trim() || undefined,
    url,
    cover: resolveArticleCoverImage(article, context),
  };
}

export function articlesToAudioTracks(
  articles: Article[],
  runtimeBase: string | null,
  context?: ArticleCoverImageContext,
): ReaderAudioTrack[] {
  const tracks: ReaderAudioTrack[] = [];
  for (const article of articles) {
    const track = articleToAudioTrack(article, runtimeBase, context);
    if (track) tracks.push(track);
  }
  return tracks;
}

/** Build list tracks for audio mode, including items that need detail resolution. */
export function articleToListAudioTrack(
  article: Article,
  resolvedUrl?: string | null,
  context?: ArticleCoverImageContext,
  resolvedCover?: string | null,
): ReaderAudioTrack {
  const url = resolvedUrl ?? resolveArticleAudioUrl(article) ?? PENDING_AUDIO_TRACK_URL;
  const cover = resolvedCover?.trim() || resolveArticleCoverImage(article, context);

  return {
    name: article.title,
    artist: article.author?.trim() || undefined,
    url,
    cover,
    articleId: article.id,
  };
}

export function articlesToListAudioTracks(
  articles: Article[],
  resolvedUrls?: Record<string, string>,
  context?: ArticleCoverImageContext,
  resolvedCovers?: Record<string, string>,
): ReaderAudioTrack[] {
  return articles.map(article =>
    articleToListAudioTrack(
      article,
      resolvedUrls?.[article.id],
      context,
      resolvedCovers?.[article.id],
    ),
  );
}

/** Build a channel playlist with the selected article first. */
export function buildArticleAudioPlaylist(
  articles: Article[],
  selectedArticle: Article,
  runtimeBase: string | null,
  context?: ArticleCoverImageContext,
): ReaderAudioTrack[] {
  const coverContext: ArticleCoverImageContext = {
    listArticles: context?.listArticles ?? articles,
    parentArticle: context?.parentArticle,
  };
  const playable = filterArticlesWithAudio(articles);
  if (playable.length <= 1) {
    const single = articleToAudioTrack(selectedArticle, runtimeBase, coverContext);
    return single ? [single] : [];
  }

  const selectedIndex = playable.findIndex(article => article.id === selectedArticle.id);
  const ordered = selectedIndex > 0
    ? [playable[selectedIndex], ...playable.slice(0, selectedIndex), ...playable.slice(selectedIndex + 1)]
    : playable;

  return articlesToAudioTracks(ordered, runtimeBase, coverContext);
}
