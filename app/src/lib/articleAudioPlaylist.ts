import type { ReaderAudioTrack } from "@/components/ReaderAudioPlayer";
import { resolveArticleAudioUrl } from "@/lib/articleAudioUrl";
import type { Article } from "@/types";

export function filterArticlesWithAudio(articles: Article[]): Article[] {
  return articles.filter(article => resolveArticleAudioUrl(article) !== null);
}

export function articleToAudioTrack(
  article: Article,
  _runtimeBase: string | null,
): ReaderAudioTrack | null {
  const url = resolveArticleAudioUrl(article);
  if (!url) return null;

  return {
    name: article.title,
    artist: article.author?.trim() || undefined,
    url,
    cover: article.image?.trim() || undefined,
  };
}

export function articlesToAudioTracks(
  articles: Article[],
  runtimeBase: string | null,
): ReaderAudioTrack[] {
  const tracks: ReaderAudioTrack[] = [];
  for (const article of articles) {
    const track = articleToAudioTrack(article, runtimeBase);
    if (track) tracks.push(track);
  }
  return tracks;
}

/** Build a channel playlist with the selected article first. */
export function buildArticleAudioPlaylist(
  articles: Article[],
  selectedArticle: Article,
  runtimeBase: string | null,
): ReaderAudioTrack[] {
  const playable = filterArticlesWithAudio(articles);
  if (playable.length <= 1) {
    const single = articleToAudioTrack(selectedArticle, runtimeBase);
    return single ? [single] : [];
  }

  const selectedIndex = playable.findIndex(article => article.id === selectedArticle.id);
  const ordered = selectedIndex > 0
    ? [playable[selectedIndex], ...playable.slice(0, selectedIndex), ...playable.slice(selectedIndex + 1)]
    : playable;

  return articlesToAudioTracks(ordered, runtimeBase);
}
