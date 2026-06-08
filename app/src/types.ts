export type ContentType = "text" | "video" | "audio" | "image";

export type ThemeMode = "light" | "dark";

export type ActiveTab = "today" | "bookmarks" | "trending" | "all";
export type CategoryFilter = "all" | ContentType;

export interface PluginChannel {
  id: string;
  label: string;
  feedUrl?: string;
  route?: string;
  params?: Record<string, string>;
  itemLimit?: number;
}

export interface Article {
  id: string;
  title: string;
  summary: string;
  content?: string;
  type: ContentType;
  pluginId: string;
  pluginName: string;
  channelId?: string;
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

export type PluginMarketCategory = "all" | string;

export interface DictItem {
  id: number;
  dictType: string;
  label: string;
  labelEn: string;
  value: string;
  sortOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DictListResponse {
  code: number;
  message: string;
  data: DictItem[];
}

export type MarketPluginSort = "rating" | "downloads" | "size";

export interface MarketPluginItem {
  id: string;
  name: string;
  categoryId: number;
  tag: string;
  tagColor?: string;
  desc: string;
  longDesc?: string;
  size?: string;
  stars?: number;
  upvotes?: number;
  downvotes?: number;
  comments?: number;
  author?: string;
  authorAvatarUrl?: string;
  logoUrl?: string;
  icon?: string;
  iconColor?: string;
  colorClass?: string;
  accentColor?: string;
  downloads?: number;
}

export interface MarketPluginsResponse {
  code: number;
  message: string;
  data: {
    items: MarketPluginItem[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface Plugin {
  id: string;
  name: string;
  icon: PluginContentType | string;
  mediaType?: "article" | "manga" | "video" | "audio";
  active?: boolean;
  desc: string;
  channels?: PluginChannel[];
  defaultChannel?: string;
  refreshInterval?: number;
  userAgent?: string;
  logoText?: string;
  logoImageUrl?: string;
  iconUrl?: string;
  color: string;
  marketCategory?: Exclude<PluginMarketCategory, "all">;
  categoryTag?: string;
  official?: boolean;
  source?: string;
  sort?: number;
  lastError?: string;
}

export interface FeedResponse {
  ok: boolean;
  items: Article[];
  count: number;
  total?: number;
  unreadTotal?: number;
  limit?: number;
  offset?: number;
}

export interface FeedItemResponse {
  ok: boolean;
  item: Article;
}

export interface PluginsResponse {
  plugins: Plugin[];
}

export interface InstallRSSPluginRequest {
  source?: "rss";
  channels?: PluginChannel[];
  feedUrl?: string;
  defaultChannel?: string;
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
