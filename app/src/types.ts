export type ContentType = "text" | "video" | "audio" | "image";

export type ThemeMode =
  | "light"
  | "midnight"
  | "forest"
  | "rose"
  | "ocean"
  | "amber"
  | "slate"
  | "crimson"
  | "sand";

/** Article reader uses a simplified light/dark split */
export type ArticleContentTheme = "light" | "dark";

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
  /** Extra param keys from fetch `next` merged on load-more (e.g. seenIds). */
  carryParams?: string[];
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
  playback?: PlaybackFeature;
}

export type PlaybackMode = "video" | "audio" | "article" | "manga";

export const PLUGIN_MEDIA_TYPES = [
  "article",
  "manga",
  "image",
  "video",
  "audio",
  "rating",
  "social",
  "novel",
] as const;

export type PluginMediaType = (typeof PLUGIN_MEDIA_TYPES)[number];

export function isPluginMediaType(value: string): value is PluginMediaType {
  return (PLUGIN_MEDIA_TYPES as readonly string[]).includes(value);
}

export interface PlaybackConfig {
  history?: boolean;
  progress?: boolean;
  mode?: PlaybackMode;
  limit?: number;
  managedBy?: "runtime" | "plugin";
}

export interface PlaybackFeature {
  history?: boolean;
  progress?: boolean;
  mode?: PlaybackMode;
  limit?: number;
}

export interface ResolvedPlaybackConfig {
  history: boolean;
  progress: boolean;
  mode: PlaybackMode;
  limit: number;
  managedBy: "runtime" | "plugin";
}

export interface ProgressTime {
  position?: number;
  duration?: number;
}

export interface ProgressArticle {
  offset?: number;
  total?: number;
  anchor?: string;
}

export interface ProgressManga {
  page?: number;
  totalPages?: number;
}

export type PlaybackProgress = ProgressTime | ProgressArticle | ProgressManga;

export interface PlaybackRecord {
  parentId: string;
  chapterId?: string;
  channelId?: string;
  parentTitle?: string;
  chapterTitle?: string;
  cover?: string;
  mode?: PlaybackMode;
  progress?: PlaybackProgress;
  updatedAt: number;
}

export interface PlaybackResumeIntent {
  chapterId?: string;
  progress?: PlaybackProgress;
  mode?: PlaybackMode;
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
  playback?: ResolvedPlaybackConfig;
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

export interface SocialStats {
  likes: number;
  replies: number;
  restacks: number;
}

export interface SocialMedia {
  type: "image" | "video" | "link" | string;
  url?: string;
  thumbnail?: string;
  title?: string;
  playbackId?: string;
  width?: number;
  height?: number;
}

export interface SocialQuote {
  id: string;
  author: string;
  authorAvatar?: string;
  authorHandle?: string;
  body: string;
  url?: string;
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
  kind?: "short" | "long" | string;
  authorAvatar?: string;
  authorHandle?: string;
  stats?: SocialStats;
  media?: SocialMedia[];
  quote?: SocialQuote;
}

export type PluginContentType = "text" | "video" | "audio" | "image";

export type PluginManagerTab = "market" | "manage" | "system" | "import" | "llm" | "tts";

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

export type MarketPluginRequiresConfigFilter = "all" | "required" | "optional";

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
  /** When true, plugin requires user configuration (e.g. API keys) before use. */
  requiresConfig?: boolean;
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

export interface BrowserConfig {
  purpose?: string;
  required?: boolean;
  fallbackOn?: string[];
  persist?: string[];
  origins?: string[];
}

export interface BrowserSessionInfo {
  pluginId: string;
  pluginName?: string;
  origins: string[];
  persist: string[];
  /** Prefer opening this URL (e.g. channel page) instead of origin root. */
  startUrl?: string;
}

export interface BrowserSessionPluginContext {
  id: string;
  name?: string;
  browser?: BrowserConfig;
  variablesSchema?: Record<string, VariableDefinition>;
  channels?: PluginChannel[];
  lastError?: string;
}

export interface Plugin {
  id: string;
  name: string;
  icon: PluginContentType | string;
  mediaType?: PluginMediaType;
  active?: boolean;
  /** When true, plugin content appears in Today 全部 aggregate feed */
  includeInAll?: boolean;
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
  contentRating?: MarketPluginContentRating;
  variablesSchema?: Record<string, VariableDefinition>;
  /** Whether all required user variables are configured (wasm plugins). */
  variablesReady?: boolean;
  playback?: PlaybackConfig;
  capabilities?: string[];
  browser?: BrowserConfig;
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
  mediaType?: PluginMediaType;
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
