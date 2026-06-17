export type ContentType = "text" | "video" | "audio" | "image";

export type ThemeMode = "light" | "dark";

export type ActiveTab = "today" | "bookmarks" | "trending" | "all";
export type CategoryFilter = "all" | ContentType;

export interface FeedFeature {
  persist?: boolean;
  refresh?: boolean;
  limit?: number;
}

export interface PaginationFeature {
  style: "offset" | "cursor" | "lastId";
  param?: string;
  default?: string;
  idFrom?: string;
  sizeParam?: string;
  defaultSize?: number;
}

export interface SearchFeature {
  param?: string;
  required?: boolean;
}

export interface DetailFeature {
  route: string;
  idParam?: string;
  idFrom?: string;
  persist?: boolean;
}

export interface ChapterDetailFeature {
  route: string;
  idParam?: string;
  idFrom?: string;
  parentParam?: string;
  parentFrom?: string;
  persist?: boolean;
}

export interface ChaptersFeature {
  route: string;
  idParam?: string;
  idFrom?: string;
  label?: string;
  itemLabel?: string;
  persist?: boolean;
  limit?: number;
  pagination?: PaginationFeature;
  detail?: ChapterDetailFeature;
}

export interface ChannelFeatures {
  feed?: FeedFeature;
  pagination?: PaginationFeature;
  search?: SearchFeature;
  detail?: DetailFeature;
  chapters?: ChaptersFeature;
}

export interface ChannelCapabilities {
  canRefresh: boolean;
  canLoadMore: boolean;
  canLoadMoreChapters: boolean;
  canRefreshChapters: boolean;
  canSearch: boolean;
  hasDetail: boolean;
  hasChapters: boolean;
  persistList: boolean;
  pagination?: PaginationFeature;
  chaptersLabel?: string;
  chaptersItemLabel?: string;
}

export interface VariableDefinition {
  label: string;
  description?: string;
  required?: boolean;
  secret?: boolean;
  default?: string;
}

export interface PluginChannel {
  id: string;
  label: string;
  feedUrl?: string;
  route?: string;
  params?: Record<string, string>;
  status?: "enabled" | "disabled";
  features?: ChannelFeatures;
  /** @deprecated v1 only */
  itemLimit?: number;
  /** @deprecated v1 only */
  type?: "search" | "detail" | string;
  /** @deprecated v1 only */
  dynamic?: boolean;
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

export type PluginManagerTab = "market" | "manage" | "system" | "import";

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

export type MarketPluginContentRating = "general" | "under18" | "mature";

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
  version?: string;
  contentRating?: MarketPluginContentRating;
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

export interface PluginCategoryCountsResponse {
  code: number;
  message: string;
  data: {
    total: number;
    counts: Record<string, number>;
  };
}

export interface Plugin {
  id: string;
  name: string;
  icon: PluginContentType | string;
  mediaType?: "article" | "manga" | "image" | "video" | "audio" | "rating";
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
  installedAt?: number;
  lastError?: string;
  version?: string;
  marketId?: string;
  variablesSchema?: Record<string, VariableDefinition>;
}

export interface FeedResponse {
  ok: boolean;
  items: Article[];
  count: number;
  total?: number;
  hasMore?: boolean;
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
  mediaType?: "article" | "manga" | "image" | "video" | "audio" | "rating";
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
