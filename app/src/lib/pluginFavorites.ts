import type { Article, PluginChannel } from "@/types";

export const PLUGIN_FAVORITES_CHANNEL_ID = "__orbit_favorites__";
export const PLUGIN_FAVORITES_CHANNEL_LABEL = "收藏";

const ENABLED_KEY = "orbit.pluginFavoritesEnabled";
const ARTICLES_KEY = "orbit.pluginFavoriteArticles";

export function isPluginFavoritesChannel(channelId: string): boolean {
  return channelId === PLUGIN_FAVORITES_CHANNEL_ID;
}

export function createFavoritesChannel(): PluginChannel {
  return {
    id: PLUGIN_FAVORITES_CHANNEL_ID,
    label: PLUGIN_FAVORITES_CHANNEL_LABEL,
    status: "enabled",
  };
}

export function loadFavoritesEnabledPluginIds(): Set<string> {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

export function persistFavoritesEnabledPluginIds(ids: Set<string>): void {
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore quota / private mode
  }
}

export function loadFavoriteArticlesByPlugin(): Record<string, Article[]> {
  try {
    const raw = localStorage.getItem(ARTICLES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, Article[]> = {};
    for (const [pluginId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      result[pluginId] = value.filter(isFavoriteArticleRecord);
    }
    return result;
  } catch {
    return {};
  }
}

export function persistFavoriteArticlesByPlugin(map: Record<string, Article[]>): void {
  try {
    localStorage.setItem(ARTICLES_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

function isFavoriteArticleRecord(value: unknown): value is Article {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Article>;
  return typeof item.id === "string"
    && item.id.length > 0
    && typeof item.pluginId === "string"
    && typeof item.title === "string";
}

export function getFavoriteArticlesForPlugin(
  map: Record<string, Article[]>,
  pluginId: string,
): Article[] {
  return map[pluginId] ?? [];
}

export function isArticleInPluginFavorites(
  map: Record<string, Article[]>,
  pluginId: string,
  articleId: string,
): boolean {
  return (map[pluginId] ?? []).some(article => article.id === articleId);
}

export function toggleFavoriteArticleInMap(
  map: Record<string, Article[]>,
  article: Article,
): Record<string, Article[]> {
  const pluginId = article.pluginId;
  const list = map[pluginId] ?? [];
  const exists = list.some(item => item.id === article.id);
  const nextList = exists
    ? list.filter(item => item.id !== article.id)
    : [
        {
          ...article,
          isBookmarked: true,
        },
        ...list,
      ];
  return {
    ...map,
    [pluginId]: nextList,
  };
}
