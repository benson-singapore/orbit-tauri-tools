export type ContentType = "text" | "video" | "audio" | "image";

export type ThemeMode = "light" | "dark";

export type ActiveTab = "today" | "bookmarks" | "trending" | "all";
export type CategoryFilter = "all" | ContentType;

export interface Article {
  id: string;
  title: string;
  summary: string;
  content: string;
  type: ContentType;
  pluginId: string;
  pluginName: string;
  author: string;
  time: string;
  reads: string;
  image?: string;
  videoUrl?: string;
  audioUrl?: string;
  audioDuration?: string;
  galleryImages?: string[];
  sourceUrl?: string;
  tags: string[];
  isBookmarked: boolean;
  isRead: boolean;
}

export type PluginContentType = "text" | "video" | "audio" | "image";

export type PluginManagerTab = "market" | "manage" | "import";

export type PluginMarketCategory =
  | "all"
  | "news"
  | "manga"
  | "video"
  | "audio"
  | "blog";

export interface Plugin {
  id: string;
  name: string;
  icon: PluginContentType | string;
  mediaType?: "article" | "manga" | "video" | "audio";
  active?: boolean;
  desc: string;
  feedUrl?: string;
  refreshInterval?: number;
  userAgent?: string;
  logoText?: string;
  logoImageUrl?: string;
  color: string;
  marketCategory?: Exclude<PluginMarketCategory, "all">;
  categoryTag?: string;
  official?: boolean;
  source?: string;
  lastError?: string;
}

export interface FeedResponse {
  ok: boolean;
  items: Article[];
  count: number;
  total?: number;
  limit?: number;
  offset?: number;
}

export interface PluginsResponse {
  plugins: Plugin[];
}

export interface InstallRSSPluginRequest {
  source?: "rss";
  feedUrl: string;
  name?: string;
  id?: string;
  mediaType?: "article" | "manga" | "video" | "audio";
  refreshInterval?: number;
  userAgent?: string;
  icon?: PluginContentType;
  description?: string;
  color?: string;
  logoText?: string;
  logoImageUrl?: string;
  marketCategory?: Exclude<PluginMarketCategory, "all">;
  categoryTag?: string;
}

export interface RuntimeStatusResponse {
  ok: boolean;
  runtime: string;
  db: string;
  sqlite_path: string;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
}
