import type { Article, Plugin, SocialMedia, SocialStats } from "@/types";

export function isSocialPlugin(plugin?: Plugin | null): boolean {
  return plugin?.mediaType === "social";
}

export function resolveSocialVideoUrl(
  media: Pick<SocialMedia, "url" | "playbackId">,
): string | null {
  const url = media.url?.trim();
  if (url) return url;

  const playbackId = media.playbackId?.trim();
  if (playbackId) {
    return `https://stream.mux.com/${playbackId}.m3u8`;
  }

  return null;
}

export function articleHasSocialVideo(article: Pick<Article, "media">): boolean {
  return (article.media ?? []).some(
    item => item.type === "video" && Boolean(resolveSocialVideoUrl(item)),
  );
}

export function isShortSocialNote(article: Pick<Article, "kind">): boolean {
  return article.kind === "short";
}

export function isLongSocialNote(article: Pick<Article, "kind">): boolean {
  return article.kind === "long";
}

export function shouldOpenSocialDetail(
  article: Pick<Article, "kind" | "media">,
  plugin?: Plugin | null,
): boolean {
  return isSocialPlugin(plugin) && (isLongSocialNote(article) || articleHasSocialVideo(article));
}

export function formatSocialStats(stats?: SocialStats): string {
  if (!stats) return "";
  const parts: string[] = [];
  if (stats.likes > 0) parts.push(`${stats.likes}`);
  if (stats.replies > 0) parts.push(`${stats.replies}`);
  if (stats.restacks > 0) parts.push(`${stats.restacks}`);
  return parts.join(" · ");
}

export function socialAuthorLabel(article: Pick<Article, "author" | "authorHandle">): string {
  const handle = article.authorHandle?.trim();
  if (handle) return `@${handle}`;
  return article.author?.trim() || "";
}
