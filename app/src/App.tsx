import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import orbitLogoBlack from "@/assets/logo-black.png";
import orbitLogoWhite from "@/assets/logo-white.png";
import { Icon } from "@/components/Icon";
import { ImageGalleryFocusView } from "@/components/ImageGalleryFocusView";
import { ArticleReaderModal } from "@/components/ArticleReaderModal";
import { ReaderDock } from "@/components/ReaderDock";
import { SplitGridVideoView } from "@/components/SplitGridVideoView";
import { SplitGridDetailView, splitDetailSessionId } from "@/components/SplitGridDetailView";
import { VideoWallFocusView } from "@/components/VideoWallFocusView";
import { VideoSessionMountProvider } from "@/components/VideoWallMountContext";
import { SessionVideoSurface } from "@/components/SessionVideoSurface";
import { RatingFocusView } from "@/components/RatingFocusView";
import { PluginAvatar } from "@/components/PluginAvatar";
import { PluginChannelBar } from "@/components/PluginChannelBar";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
import { ChaptersDrawer } from "@/components/ChaptersDrawer";
import { ChaptersList } from "@/components/ChaptersList";
import { ChaptersOpenButton } from "@/components/ChaptersOpenButton";
import { ComicChapterStream } from "@/components/ComicChapterStream";
import { NovelChapterStream } from "@/components/NovelChapterStream";
import { NovelReaderSettingsButton } from "@/components/NovelReaderSettingsButton";
import { ComicPagesView } from "@/components/ComicPagesView";
import { ComicPageWidthSlider } from "@/components/ComicPageWidthSlider";
import { ArticleRatingHero, shouldShowArticleRatingHero } from "@/components/ArticleRatingHero";
import { ExperienceModeUnlockModal } from "@/components/ExperienceModeUnlockModal";
import { BrowserSessionHost } from "@/components/BrowserSessionHost";
import { BrowserSessionButton } from "@/components/BrowserSessionButton";
import { PluginManagerModal } from "@/components/PluginManagerModal";
import { PlaybackHistoryButton } from "@/components/PlaybackHistoryButton";
import { PlaybackHistoryPanel } from "@/components/PlaybackHistoryPanel";
import { useArticleChapters, shouldOpenChaptersForArticle } from "@/hooks/useArticleChapters";
import { useComicArticleDisplay } from "@/hooks/useComicArticleDisplay";
import { useComicChapterStream } from "@/hooks/useComicChapterStream";
import { useNovelChapterStream } from "@/hooks/useNovelChapterStream";
import { usePlaybackProgress } from "@/hooks/usePlaybackProgress";
import { useOrbitData } from "@/hooks/useOrbitData";
import { usePluginGroups } from "@/hooks/usePluginGroups";
import { useAppUpdateSummary } from "@/hooks/useAppUpdateSummary";
import { useExperienceModeShortcut } from "@/hooks/useExperienceModeShortcut";
import { mergeArticleListWithDetail } from "@/lib/articleContent";
import {
  filterGroupedPluginsForExperienceMode,
  EXPERIENCE_MODE_SHORTCUT_LABEL,
  isMaturePlugin,
  normalizeExperienceMode,
  persistExperienceMode,
  type ExperienceMode,
} from "@/lib/experienceMode";
import {
  isBrowseDynamicChannel,
  isBrowseDynamicPlugin,
  isRatingPluginArticle,
  resolveBrowseDynamicChannel,
  resolveDefaultPluginChannel,
  resolveArticleDetailChannel,
  resolveArticleHasDetail,
  shouldSkipFeedItemDetailFetch,
} from "@/lib/browseDynamicFeed";
import { isImageGalleryPlugin } from "@/lib/imagePlugin";
import { isSocialPlugin, shouldOpenSocialDetail } from "@/lib/socialPlugin";
import { resolveYouTubeVideoId } from "@/lib/youtube";
import {
  channelHasDynamicSearch,
  findDynamicSearchChannel,
  isChannelDynamic,
  isChannelEnabled,
} from "@/lib/channelStatus";
import { ProxiedImage } from "@/components/ProxiedImage";
import { SocialFeedCard } from "@/components/SocialFeedCard";
import { SocialFeedFocusView } from "@/components/SocialFeedFocusView";
import { AudioFocusView } from "@/components/AudioFocusView";
import { ReaderAudioPlayer } from "@/components/ReaderAudioPlayer";
import { buildArticleAudioPlaylist, resolveArticleCoverImage } from "@/lib/articleAudioPlaylist";
import { resolveArticleAudioUrl, stripEmbeddedAudioFromContent } from "@/lib/articleAudioUrl";
import { highlightArticleCode } from "@/lib/highlightArticleCode";
import { fetchFeedItem } from "@/lib/feed";
import {
  runtimeOpenDetail,
  browserSessionOptionsFromPlugin,
  resolveChannelHasDetail,
  shouldUseRuntimeV2,
} from "@/lib/runtimeV2";
import { bindArticleContentImagesWithPreview, shouldEnableArticleImagePreview } from "@/lib/articleContentImagePreview";
import { shouldEnableArticleTTS } from "@/lib/articleContentTTS";
import { useArticleContentImagePreview } from "@/hooks/useArticleContentImagePreview";
import { useArticleContentTTS } from "@/hooks/useArticleContentTTS";
import {
  formatComicChapterToolbarSubtitle,
  prepareMangaIntroDisplayContent,
} from "@/lib/comicChapterContent";
import { enhanceNovelChapterDisplayContent } from "@/lib/novelChapterContent";
import {
  isNovelBackgroundTuned,
  novelReaderSettingsToStyle,
  persistNovelReaderSettings,
  readStoredNovelReaderSettings,
  type NovelReaderSettings,
} from "@/lib/novelReaderSettings";
import {
  bindArticleContentPlayers,
  destroyArticleContentPlayers,
} from "@/lib/articleContentPlayer";
import {
  applyPlaybackResume,
  collectArticleScrollProgress,
  collectMangaPageProgress,
  hasMeaningfulProgress,
  playbackRecordToResumeIntent,
  resolveParentArticleForPlayback,
  seedPlaybackResumeSnapshot,
  fetchResumeIntentForArticle,
  shouldApplyPlaybackResumeIntent,
} from "@/lib/playbackResume";
import { isPlaybackHistoryEnabled, resolveEffectivePlayback } from "@/lib/playbackConfig";
import {
  isSerialIntroPage,
  resolveSerialChapterItemLabel,
  resolveSerialChapterNeighbors,
  shouldShowSerialChapterPager,
} from "@/lib/serialMedia";
import { waitForRuntimeReady } from "@/lib/runtime";
import {
  persistIgnoredArticleIds,
  readIgnoredArticleIds,
} from "@/lib/ignoredArticles";
import {
  createFavoritesChannel,
  getFavoriteArticlesForPlugin,
  isPluginFavoritesChannel,
  loadFavoriteArticlesByPlugin,
  loadFavoritesEnabledPluginIds,
  persistFavoriteArticlesByPlugin,
  persistFavoritesEnabledPluginIds,
  toggleFavoriteArticleInMap,
} from "@/lib/pluginFavorites";
import { FavoriteHeartButton } from "@/components/FavoriteHeartButton";
import {
  getStoredPluginChannel,
  persistPluginChannel,
} from "@/lib/pluginChannelMemory";
import {
  dockInlinePlaybackToReaderSession,
  dockPlayingExpandedSessions,
  hasInlinePlayableMedia,
  isInlineMediaPlaying,
} from "@/lib/autoDockPlayback";
import {
  getPluginBrowseSession,
  savePluginBrowseSession,
} from "@/lib/pluginBrowseSession";
import { pluginNeedsVariablesConfiguration } from "@/lib/pluginVariablesReady";
import { inferBrowserSessionForPlugin } from "@/lib/browserSessionError";
import { tryCompletePluginSession } from "@/lib/pluginSession";
import {
  getStoredPluginPreviewMode,
  persistPluginPreviewMode,
  isPreviewModeAllowedForPlugin,
  resolvePluginPreviewMode,
} from "@/lib/pluginPreviewMode";
import {
  READER_FONT_SCALE_DEFAULT,
  readStoredReaderFontScale,
} from "@/lib/readerFontScale";
import {
  COMIC_PAGE_WIDTH_DEFAULT,
  comicPageWidthCssValue,
  persistComicPageWidth,
  readStoredComicPageWidth,
} from "@/lib/comicPageWidth";
import {
  READER_CONTENT_WIDTH_DEFAULT,
  persistReaderContentWidth,
  readerContentWidthCssValue,
  readStoredReaderContentWidth,
} from "@/lib/readerContentWidth";
import {
  getStoredSocialFeedWidth,
  persistSocialFeedWidth,
  SOCIAL_FEED_WIDTH_DEFAULT,
} from "@/lib/socialFeedWidth";
import {
  articleSessionKey,
  createReaderSession,
  type ReaderSession,
} from "@/lib/readerSessions";
import {
  isWallVideoPreviewMode,
  sessionUsesWallMount,
  splitPanelVideoSessions,
} from "@/lib/sessionVideoTarget";
import {
  DEFAULT_VIDEO_WALL_COLUMN_COUNT,
  getStoredVideoWallColumnCount,
  persistVideoWallColumnCount,
} from "@/lib/videoWallColumnCount";
import {
  DEFAULT_SPLIT_PANE_RATIO,
  getStoredSplitPaneRatio,
  persistSplitPaneRatio,
} from "@/lib/splitPaneRatio";
import {
  hasDockedVideoSessions,
  isDedicatedVideoReaderSession,
  promoteArticleForSessionVideo,
} from "@/lib/readerSessionVideos";
import { useTitlebarDrag } from "@/hooks/useTitlebarDrag";
import { useTitlebarEnv } from "@/hooks/useTitlebarEnv";
import { useUiZoom } from "@/hooks/useUiZoom";
import type {
  ActiveTab,
  Article,
  CategoryFilter,
  InstallRSSPluginRequest,
  PlaybackRecord,
  PlaybackResumeIntent,
  Plugin,
  ThemeMode,
} from "@/types";
import type { PluginPreviewMode } from "@/lib/pluginPreviewMode";
import {
  getStoredGridDetailViewMode,
  persistGridDetailViewMode,
  type GridDetailViewMode,
} from "@/lib/gridDetailViewMode";
import {
  DEFAULT_GRID_COLUMN_COUNT,
  getStoredGridColumnCount,
  persistGridColumnCount,
  type GridColumnCount,
} from "@/lib/gridColumnCount";
import {
  DEFAULT_GRID_COVER_ASPECT_RATIO,
  getStoredGridCoverAspectRatio,
  persistGridCoverAspectRatio,
  type GridCoverAspectRatio,
} from "@/lib/gridCoverAspectRatio";
import { GridColumnSwitcher } from "@/components/GridColumnSwitcher";
import { GridCoverAspectSwitcher } from "@/components/GridCoverAspectSwitcher";
import { GridDetailModeSwitcher } from "@/components/GridDetailModeSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import {
  applyThemeMode,
  articleContentTheme,
  isDarkTheme,
  readStoredThemeMode,
} from "@/lib/themeMode";

const PREVIEW_MODE_OPTIONS = [
  ["reader", "阅读模式", "文章阅读布局"] as const,
  ["waterfall", "瀑布流", "图片优先布局"] as const,
  ["grid", "卡片视图", "卡片评分布局"] as const,
];

const SOCIAL_FEED_OPTION = ["socialFeed", "推文展示", "社交推文时间线"] as const;

const SPLIT_BROADCAST_OPTION = ["split", "联播分屏", "左侧卡片，右侧视频同屏联播"] as const;
const SPLIT_DETAIL_OPTION = ["splitDetail", "阅览分屏", "左侧浏览，右侧即时展示详情"] as const;
const VIDEO_WALL_PREVIEW_OPTION = ["videoWall", "视频预览", "Dock 视频平铺同播"] as const;
const AUDIO_FOCUS_OPTION = ["audioFocus", "音频模式", "频道音频组合播放列表"] as const;

const PREVIEW_MODE_LABELS: Record<PluginPreviewMode, string> = {
  reader: "阅读模式",
  waterfall: "瀑布流",
  grid: "卡片视图",
  split: "联播分屏",
  splitDetail: "阅览分屏",
  videoWall: "视频预览",
  socialFeed: "推文展示",
  audioFocus: "音频模式",
};

function previewModeLabel(mode: PluginPreviewMode): string {
  return PREVIEW_MODE_LABELS[mode] ?? "阅读模式";
}

function feedCountUnit(plugin?: Plugin | null): string {
  if (isImageGalleryPlugin(plugin)) return "张";
  if (isSocialPlugin(plugin)) return "条";
  return "篇";
}

function previewModeOptionsForPlugin(plugin: Plugin | undefined, showVideoWall: boolean) {
  const showWaterfall = isImageGalleryPlugin(plugin);
  const showSocialFeed = isSocialPlugin(plugin);
  const showAudioFocus = plugin?.mediaType === "audio";
  const base = PREVIEW_MODE_OPTIONS.filter(([mode]) => mode !== "waterfall" || showWaterfall);
  return [
    ...(showSocialFeed ? [SOCIAL_FEED_OPTION] : []),
    ...base,
    ...(showAudioFocus ? [AUDIO_FOCUS_OPTION] : []),
    SPLIT_DETAIL_OPTION,
    ...(showVideoWall ? [VIDEO_WALL_PREVIEW_OPTION] : []),
    SPLIT_BROADCAST_OPTION,
  ];
}

export default function App() {
  useUiZoom();
  useTitlebarEnv();
  const onTitlebarMouseDown = useTitlebarDrag();

  const [theme, setTheme] = useState<ThemeMode>(readStoredThemeMode);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("safe");
  const lockExperienceMode = useCallback(() => {
    setExperienceMode("safe");
    persistExperienceMode("safe");
  }, []);
  const unlockExperienceMode = useCallback(() => {
    setExperienceMode("full");
  }, []);
  const {
    unlockModalOpen,
    closeUnlockModal,
    handleUnlock,
  } = useExperienceModeShortcut({
    experienceMode,
    onLock: lockExperienceMode,
    onRequestUnlock: unlockExperienceMode,
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [feedPanelVisible, setFeedPanelVisible] = useState(true);
  const [chaptersDrawerOpen, setChaptersDrawerOpen] = useState(false);
  const [activePlugin, setActivePlugin] = useState("all");
  const [activePluginGroupId, setActivePluginGroupId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState("all");
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [focusSearchOpen, setFocusSearchOpen] = useState(false);

  const commitSearch = () => {
    setSubmittedSearch(searchQuery.trim());
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSubmittedSearch("");
  };

  const feedContentType =
    activePlugin === "all" && activeCategory !== "all"
      ? activeCategory
      : undefined;

  const {
    groups: pluginGroups,
    addGroup: addPluginGroup,
    renameGroup: renamePluginGroup,
    moveGroup: movePluginGroup,
    removeGroup: removePluginGroup,
    assignPlugin: assignPluginGroup,
    toggleCollapsed: togglePluginGroupCollapsed,
    isGroupCollapsed,
    groupedPluginsForManage,
    groupedPluginsForSidebar,
    getPluginGroupId,
  } = usePluginGroups();

  const {
    plugins: myPlugins,
    articles,
    unreadTotal,
    feedTotal,
    loading: feedLoading,
    searching: feedSearching,
    loadingMore: feedLoadingMore,
    hasMore: feedHasMore,
    feedPageSize,
    channelCapabilities,
    error: feedError,
    reload,
    refreshFromCache,
    loadMore,
    markArticleRead,
    installCustomRSS,
    togglePluginActive: orbitTogglePluginActive,
    togglePluginIncludeInAll: orbitTogglePluginIncludeInAll,
    removePlugin: orbitRemovePlugin,
    movePlugin: orbitMovePlugin,
    reorderPlugins: orbitReorderPlugins,
    installOfficialPlugin: orbitInstallOfficialPlugin,
    updateOfficialPlugin: orbitUpdateOfficialPlugin,
    savePluginManifest: orbitSavePluginManifest,
    forceRefreshPlugin: orbitForceRefreshPlugin,
    refreshChannelFeed,
  } = useOrbitData(
    activePlugin,
    activeChannel,
    feedContentType,
    submittedSearch,
    activePluginGroupId,
    getPluginGroupId,
  );

  const pluginById = useMemo(
    () => new Map(myPlugins.map(plugin => [plugin.id, plugin] as const)),
    [myPlugins],
  );

  useEffect(() => {
    if (experienceMode !== "safe") return;
    const plugin = pluginById.get(activePlugin);
    if (plugin && isMaturePlugin(plugin)) {
      setActivePlugin("all");
    }
  }, [experienceMode, activePlugin, pluginById]);

  useEffect(() => {
    // Always reset to safe on reload / app restart.
    persistExperienceMode("safe");
  }, []);

  useEffect(() => {
    const normalized = normalizeExperienceMode(experienceMode);
    if (normalized !== experienceMode) {
      setExperienceMode(normalized);
      if (normalized === "safe") {
        persistExperienceMode("safe");
      }
    }
  }, [experienceMode]);

  useEffect(() => {
    if (activePlugin === "all") return;
    const plugin = pluginById.get(activePlugin);
    if (plugin && pluginNeedsVariablesConfiguration(plugin)) {
      setActivePlugin("all");
    }
  }, [activePlugin, pluginById]);

  const sidebarPluginGroups = useMemo(
    () => filterGroupedPluginsForExperienceMode(
      groupedPluginsForSidebar(myPlugins),
      experienceMode,
    ),
    [groupedPluginsForSidebar, myPlugins, experienceMode],
  );

  const managePluginGroups = useMemo(
    () => groupedPluginsForManage(myPlugins),
    [groupedPluginsForManage, myPlugins],
  );

  const activeGroupLabel = useMemo(() => {
    if (!activePluginGroupId) return null;
    return (
      pluginGroups.find(g => g.id === activePluginGroupId)?.label
      ?? sidebarPluginGroups.find(g => g.group.id === activePluginGroupId)?.group.label
      ?? null
    );
  }, [activePluginGroupId, pluginGroups, sidebarPluginGroups]);

  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(() => readIgnoredArticleIds());
  const [favoritesEnabledPluginIds, setFavoritesEnabledPluginIds] = useState<Set<string>>(
    () => loadFavoritesEnabledPluginIds(),
  );
  const [favoriteArticlesByPlugin, setFavoriteArticlesByPlugin] = useState<Record<string, Article[]>>(
    () => loadFavoriteArticlesByPlugin(),
  );
  const articlesWithBookmarks = useMemo(
    () =>
      articles.map(item => ({
        ...item,
        isBookmarked: bookmarkedIds.has(item.id),
      })),
    [articles, bookmarkedIds],
  );
  const visibleArticles = useMemo(
    () => articlesWithBookmarks.filter(item => !ignoredIds.has(item.id)),
    [articlesWithBookmarks, ignoredIds],
  );

  const [selectedItem, setSelectedItem] = useState<Article | null>(null);
  const selectedItemRef = useRef<Article | null>(null);
  selectedItemRef.current = selectedItem;
  const itemSelectRequestRef = useRef(0);
  const [chaptersParent, setChaptersParent] = useState<Article | null>(null);
  const [chaptersOpenToken, setChaptersOpenToken] = useState(0);
  const chaptersParentRef = useRef<Article | null>(null);
  const [splitDetailArticle, setSplitDetailArticle] = useState<Article | null>(null);
  const [splitDetailFeedChannel, setSplitDetailFeedChannel] = useState<string | null>(null);
  const splitDetailArticleRef = useRef<Article | null>(null);
  splitDetailArticleRef.current = splitDetailArticle;
  const [contentLoading, setContentLoading] = useState(false);
  const [novelPlaybackChapter, setNovelPlaybackChapter] = useState<Article | null>(null);
  const novelPlaybackChapterRef = useRef<Article | null>(null);
  const pendingPluginRestoreRef = useRef<string | null>(null);
  const restoringBrowseSessionRef = useRef(false);
  const suppressAutoSelectRef = useRef(false);
  const articleContentRef = useRef<HTMLDivElement>(null);
  const [runtimeBase, setRuntimeBase] = useState<string | null>(null);
  const { openImagePreview, previewLightbox } = useArticleContentImagePreview(runtimeBase);
  const { bindTTS, ttsOverlays } = useArticleContentTTS(theme, {
    experienceUnlocked: experienceMode === "full",
  });

  useEffect(() => {
    void waitForRuntimeReady().then((url: string) => {
      setRuntimeBase(url.replace(/\/$/, ""));
    });
  }, []);
  const readerPanelRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("today");

  const [showPluginStore, setShowPluginStore] = useState(false);
  const [appUpdateSummary, setAppUpdateSummary] = useAppUpdateSummary();
  const [isSidebarRefreshing, setIsSidebarRefreshing] = useState(false);

  useEffect(() => {
    if (pendingPluginRestoreRef.current === activePlugin) return;
    setChaptersParent(null);
    setDetailResumeIntent(undefined);
  }, [activePlugin, activeChannel]);

  const [pluginPreviewMode, setPluginPreviewMode] = useState<PluginPreviewMode>("reader");
  const [previewModeMenuOpen, setPreviewModeMenuOpen] = useState(false);
  const [gridColumnCount, setGridColumnCount] = useState<GridColumnCount>(DEFAULT_GRID_COLUMN_COUNT);
  const [gridCoverAspectRatio, setGridCoverAspectRatio] = useState<GridCoverAspectRatio>(
    DEFAULT_GRID_COVER_ASPECT_RATIO,
  );
  const [gridDetailViewMode, setGridDetailViewMode] = useState<GridDetailViewMode>("modal");
  const [gridPageDetailOpen, setGridPageDetailOpen] = useState(false);
  const [videoWallColumnCount, setVideoWallColumnCount] = useState<GridColumnCount>(
    DEFAULT_VIDEO_WALL_COLUMN_COUNT,
  );
  const [splitPaneRatio, setSplitPaneRatio] = useState(DEFAULT_SPLIT_PANE_RATIO);
  const previewModeMenuRef = useRef<HTMLDivElement>(null);
  const [readerSessions, setReaderSessions] = useState<ReaderSession[]>([]);
  const [playbackHistoryOpen, setPlaybackHistoryOpen] = useState(false);
  const [detailResumeIntent, setDetailResumeIntent] = useState<PlaybackResumeIntent | undefined>();
  const detailResumeAppliedRef = useRef(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [readerFontScale, setReaderFontScale] = useState(READER_FONT_SCALE_DEFAULT);
  const [comicPageWidth, setComicPageWidth] = useState(COMIC_PAGE_WIDTH_DEFAULT);
  const [readerContentWidth, setReaderContentWidth] = useState(READER_CONTENT_WIDTH_DEFAULT);
  const [novelReaderSettings, setNovelReaderSettings] = useState<NovelReaderSettings>(
    readStoredNovelReaderSettings,
  );
  const [socialFeedWidth, setSocialFeedWidth] = useState(SOCIAL_FEED_WIDTH_DEFAULT);

  useEffect(() => {
    setReaderFontScale(readStoredReaderFontScale());
    setComicPageWidth(readStoredComicPageWidth());
    setReaderContentWidth(readStoredReaderContentWidth());
    setNovelReaderSettings(readStoredNovelReaderSettings());
  }, []);

  const handleNovelReaderSettingsChange = useCallback((settings: NovelReaderSettings) => {
    setNovelReaderSettings(settings);
    persistNovelReaderSettings(settings);
  }, []);

  const handleComicPageWidthChange = useCallback((width: number) => {
    setComicPageWidth(width);
    persistComicPageWidth(width);
  }, []);

  const handleReaderContentWidthChange = useCallback((width: number) => {
    setReaderContentWidth(width);
    persistReaderContentWidth(width);
  }, []);

  const handleSocialFeedWidthChange = useCallback((width: number) => {
    setSocialFeedWidth(width);
    if (activePlugin !== "all") {
      persistSocialFeedWidth(activePlugin, width);
    }
  }, [activePlugin]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  // Image Slider Index
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const [failedThumbnailIds, setFailedThumbnailIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCoverImageFailed(false);
  }, [selectedItem?.id, selectedItem?.image]);

  useEffect(() => {
    setFailedThumbnailIds(new Set());
  }, [articles]);

  const showArticleMedia = useMemo(() => {
    if (!selectedItem) return false;
    if (resolveArticleAudioUrl(selectedItem) !== null) {
      return true;
    }
    if (selectedItem.type === "text") {
      return Boolean(selectedItem.image?.trim()) && !coverImageFailed;
    }
    if (selectedItem.type === "video") {
      return Boolean(
        resolveYouTubeVideoId(selectedItem) || selectedItem.videoUrl?.trim(),
      );
    }
    if (selectedItem.type === "audio") {
      return resolveArticleAudioUrl(selectedItem) !== null;
    }
    if (selectedItem.type === "image") {
      if (selectedItem.galleryImages?.length) {
        return true;
      }
      return Boolean(selectedItem.image?.trim()) && !coverImageFailed;
    }
    return false;
  }, [selectedItem, coverImageFailed]);

  const selectedYouTubeVideoId = useMemo(
    () => (selectedItem ? resolveYouTubeVideoId(selectedItem) : null),
    [selectedItem],
  );

  const selectedAudioUrl = useMemo(
    () => (selectedItem ? resolveArticleAudioUrl(selectedItem) : null),
    [selectedItem],
  );

  const {
    pageUrls: comicPageUrls,
    html: comicHtml,
    isComicHtml,
    isComicReader: isComicReaderContent,
  } = useComicArticleDisplay(selectedItem, runtimeBase, theme);

  const baseDisplayContent = comicHtml;

  const filteredArticles = useMemo(() => {
    return visibleArticles.filter(item => {
      // Filter by custom left-side tabs
      if (activeTab === 'bookmarks' && !item.isBookmarked) {
        return false;
      }
      if (activeTab === 'trending' && item.reads && parseInt(item.reads) < 15) {
        // Simple trending heuristic for items with higher readership
        if (!item.reads.includes('k')) return false;
      }

      return true;
    });
  }, [visibleArticles, activeTab]);

  const isFavoritesChannelActive = isPluginFavoritesChannel(activeChannel)
    && activePlugin !== "all"
    && favoritesEnabledPluginIds.has(activePlugin);

  const pluginFavoriteArticles = useMemo(() => {
    if (activePlugin === "all") return [];
    return getFavoriteArticlesForPlugin(favoriteArticlesByPlugin, activePlugin);
  }, [activePlugin, favoriteArticlesByPlugin]);

  const favoritedArticleIds = useMemo(() => {
    if (activePlugin === "all") return new Set<string>();
    return new Set(pluginFavoriteArticles.map(item => item.id));
  }, [activePlugin, pluginFavoriteArticles]);

  const isPluginFavoritesEnabled = activePlugin !== "all"
    && favoritesEnabledPluginIds.has(activePlugin);

  const pluginFeedArticles = useMemo(() => {
    if (isFavoritesChannelActive) {
      return pluginFavoriteArticles;
    }
    return filteredArticles.filter(item => item.pluginId === activePlugin);
  }, [isFavoritesChannelActive, pluginFavoriteArticles, filteredArticles, activePlugin]);

  const listDisplayArticles = useMemo(() => {
    if (isFavoritesChannelActive) {
      return pluginFavoriteArticles;
    }
    return filteredArticles;
  }, [isFavoritesChannelActive, pluginFavoriteArticles, filteredArticles]);

  const selectedAudioPlaylist = useMemo(() => {
    if (!selectedItem || !selectedAudioUrl) return undefined;
    const samePluginArticles = filteredArticles.filter(
      item => item.pluginId === selectedItem.pluginId,
    );
    const coverContext = {
      listArticles: filteredArticles,
      parentArticle: chaptersParent,
    };
    const playlist = buildArticleAudioPlaylist(
      samePluginArticles,
      selectedItem,
      runtimeBase,
      coverContext,
    );
    return playlist.length > 1 ? playlist : undefined;
  }, [selectedItem, selectedAudioUrl, filteredArticles, runtimeBase, chaptersParent]);

  const selectedAudioCoverImage = useMemo(() => {
    if (!selectedItem) return undefined;
    return resolveArticleCoverImage(selectedItem, {
      listArticles: filteredArticles,
      parentArticle: chaptersParent,
    });
  }, [selectedItem, filteredArticles, chaptersParent]);

  const selectedPluginMeta = selectedItem ? pluginById.get(selectedItem.pluginId) : undefined;
  const isRatingCoverLayout = Boolean(
    selectedItem && isRatingPluginArticle(selectedItem, selectedPluginMeta),
  );
  const showRatingHero = Boolean(
    selectedItem
    && shouldShowArticleRatingHero(selectedItem, {
      isRatingLayout: isRatingCoverLayout,
      showArticleMedia,
      coverImageFailed,
    }),
  );

  const activePluginChannels = useMemo(() => {
    if (activePlugin === "all") return [];
    const channels = (pluginById.get(activePlugin)?.channels ?? []).filter(ch =>
      isChannelEnabled(ch.status),
    );
    if (!favoritesEnabledPluginIds.has(activePlugin)) {
      return channels;
    }
    return [createFavoritesChannel(), ...channels];
  }, [activePlugin, pluginById, favoritesEnabledPluginIds]);

  const activePluginMeta = useMemo(
    () => (activePlugin === "all" ? undefined : pluginById.get(activePlugin)),
    [activePlugin, pluginById],
  );

  const activeChannelMeta = useMemo(() => {
    if (activePlugin === "all" || activeChannel === "all") return undefined;
    return activePluginChannels.find(ch => ch.id === activeChannel);
  }, [activePlugin, activeChannel, activePluginChannels]);

  void activeChannelMeta;

  const isActiveDynamicChannel = channelCapabilities.canSearch
    || channelHasDynamicSearch(activeChannelMeta);

  const isBrowseDynamicPluginActive = useMemo(
    () => isBrowseDynamicPlugin(activePluginMeta, activePluginChannels),
    [activePluginMeta, activePluginChannels],
  );

  const resolvePluginChannel = useCallback(
    (pluginId: string): string => {
      const plugin = pluginById.get(pluginId);
      const channels = (plugin?.channels ?? []).filter(ch => isChannelEnabled(ch.status));
      if (plugin && isBrowseDynamicPlugin(plugin, channels)) {
        return resolveBrowseDynamicChannel(plugin, channels, getStoredPluginChannel(pluginId));
      }
      return resolveDefaultPluginChannel(plugin, channels, getStoredPluginChannel(pluginId));
    },
    [pluginById],
  );

  useEffect(() => {
    if (activePlugin === "all") return;
    if (activeChannel !== "all" && activePluginChannels.some(ch => ch.id === activeChannel)) {
      return;
    }
    const resolved = resolvePluginChannel(activePlugin);
    if (resolved !== activeChannel) {
      setActiveChannel(resolved);
      if (resolved !== "all") {
        persistPluginChannel(activePlugin, resolved);
      }
    }
  }, [activeChannel, activePluginChannels, activePlugin, resolvePluginChannel]);

  const showPluginChannelBar = activePluginChannels.length > 1
    || (isPluginFavoritesEnabled && activePluginChannels.length > 0);
  const isReaderPreviewMode = pluginPreviewMode === "reader";
  const isWaterfallPreviewMode = pluginPreviewMode === "waterfall";
  const isGridPreviewMode = pluginPreviewMode === "grid";
  const isSplitBroadcastMode = pluginPreviewMode === "split";
  const isSplitDetailMode = pluginPreviewMode === "splitDetail";
  const isSplitPreviewMode = isSplitBroadcastMode || isSplitDetailMode;
  const isSplitPaneLayout = isSplitPreviewMode && activePlugin !== "all";
  const isVideoWallPreviewMode = pluginPreviewMode === "videoWall";
  const isSocialFeedPreviewMode = pluginPreviewMode === "socialFeed"
    && isSocialPlugin(activePluginMeta);
  const isAudioFocusPreviewMode = pluginPreviewMode === "audioFocus";
  const isGridPageMode = isGridPreviewMode && gridDetailViewMode === "page";
  const isPageDetailView = isGridPageMode && gridPageDetailOpen;
  const isWallVideoActive = isWallVideoPreviewMode(pluginPreviewMode);
  const showVideoWallPreviewOption = hasDockedVideoSessions(readerSessions);
  const videoWallSessions = useMemo(
    () => readerSessions.filter(isDedicatedVideoReaderSession),
    [readerSessions],
  );
  const splitWallSessions = useMemo(
    () => splitPanelVideoSessions(readerSessions),
    [readerSessions],
  );
  const splitDetailVideoArticle = useMemo(() => null, []);

  const hasFilteredArticles = isFavoritesChannelActive
    ? pluginFavoriteArticles.length > 0
    : filteredArticles.length > 0;
  const filteredArticlesRef = useRef(filteredArticles);
  filteredArticlesRef.current = filteredArticles;

  useEffect(() => {
    if (!isSplitDetailMode || activePlugin === "all") return;

    const prev = splitDetailArticleRef.current;
    if (prev?.pluginId === activePlugin) return;

    const session = getPluginBrowseSession(activePlugin);
    if (session?.splitDetailArticle?.pluginId === activePlugin) {
      setSplitDetailArticle(session.splitDetailArticle);
      setSplitDetailFeedChannel(session.splitDetailFeedChannel);
      return;
    }

    const pluginArticles = filteredArticlesRef.current.filter(item => item.pluginId === activePlugin);
    const first = pluginArticles[0] ?? null;
    setSplitDetailArticle(first);
    setSplitDetailFeedChannel(first ? activeChannel : null);
    // Depend on hasFilteredArticles (boolean) rather than the articles array so feed
    // pagination does not re-enter this effect and disturb the open detail.
  }, [isSplitDetailMode, activePlugin, activeChannel, hasFilteredArticles]);

  const splitDetailActiveChannel = useMemo(() => {
    const fromArticle = splitDetailArticle?.channelId?.trim();
    if (fromArticle) return fromArticle;
    return splitDetailFeedChannel ?? activeChannel;
  }, [splitDetailArticle, splitDetailFeedChannel, activeChannel]);

  const splitDetailHasDetail = useMemo(
    () => resolveChannelHasDetail(activePluginMeta, splitDetailActiveChannel, channelCapabilities),
    [activePluginMeta, splitDetailActiveChannel, channelCapabilities],
  );

  const hideFeedPanel = !isReaderPreviewMode || !feedPanelVisible;
  const isPluginFocusMode = !isReaderPreviewMode && activePlugin !== "all";
  const showFocusModeSearch = isPluginFocusMode && !isBrowseDynamicPluginActive;
  const showFocusSearchInput = showFocusModeSearch
    && (isActiveDynamicChannel || focusSearchOpen || Boolean(submittedSearch));
  const showFocusSearchButton = showFocusModeSearch && !showFocusSearchInput;

  const showFeedChannelActions = activePlugin !== "all"
    && channelCapabilities.canRefresh
    && activeTab !== "bookmarks"
    && activeTab !== "trending";

  const showFocusModeRefreshButton = isPluginFocusMode && showFeedChannelActions;

  const showPlaybackHistoryButton = activePlugin !== "all"
    && isPlaybackHistoryEnabled(activePluginMeta, activeChannel, channelCapabilities);

  const feedListBusy = feedLoading || feedRefreshing;

  const handleFeedRefresh = () => {
    if (feedListBusy) return;
    setFeedRefreshing(true);
    void (async () => {
      try {
        const session = activePluginMeta
          ? inferBrowserSessionForPlugin(activePluginMeta)
          : null;
        if (session) {
          await tryCompletePluginSession(session);
        }
        await refreshChannelFeed();
      } catch (err) {
        console.error("refresh channel feed failed", err);
      } finally {
        setFeedRefreshing(false);
      }
    })();
  };

  useEffect(() => {
    applyThemeMode(theme);
  }, [theme]);

  const handleSidebarRefresh = () => {
    if (isSidebarRefreshing) return;
    setIsSidebarRefreshing(true);
    void refreshFromCache()
      .finally(() => {
        setIsSidebarRefreshing(false);
      });
  };

  const chaptersPluginMeta = chaptersParent
    ? pluginById.get(chaptersParent.pluginId)
    : undefined;
  const chaptersStoredChannel = chaptersParent
    ? getStoredPluginChannel(chaptersParent.pluginId)
    : undefined;

  chaptersParentRef.current = chaptersParent;
  novelPlaybackChapterRef.current = novelPlaybackChapter;

  const chaptersDetailChannelId = useMemo(() => {
    if (!chaptersParent) return activeChannel;
    return resolveArticleDetailChannel(
      chaptersParent,
      chaptersPluginMeta,
      activeChannel,
      chaptersStoredChannel,
    );
  }, [chaptersParent, chaptersPluginMeta, activeChannel, chaptersStoredChannel]);

  const chapters = useArticleChapters({
    parent: chaptersParent,
    activeChannel,
    pluginMeta: chaptersPluginMeta,
    capabilities: channelCapabilities,
    storedChannel: chaptersStoredChannel,
    enabled: Boolean(chaptersParent),
    initialChapterId: detailResumeIntent?.chapterId,
    openToken: chaptersOpenToken,
    onChapterDetail: article => {
      setSelectedItem(article);
    },
    onChapterDetailLoaded: () => {
      detailResumeAppliedRef.current = false;
    },
  });

  // Keep stream enabled without requiring activeChapter — brief clears during
  // reload must not disable the hook or remount page images (CDN 403).
  const canUseComicChapterStream = Boolean(
    isComicReaderContent
    && chapters.isActive
    && chaptersParent,
  );

  const comicStream = useComicChapterStream({
    enabled: canUseComicChapterStream,
    parent: chaptersParent,
    chapterItems: chapters.items,
    activeChapter: chapters.activeChapter,
    activeChapterDetail: selectedItem,
    detailLoading: chapters.detailLoading,
    channelId: chaptersDetailChannelId,
    runtimeBase,
    theme,
    scrollRootRef: readerPanelRef,
  });

  const useComicChapterStreamMode = canUseComicChapterStream;
  const comicChapterStreamActive = comicStream.slots.length > 0;

  const canUseNovelChapterStream = Boolean(
    chaptersPluginMeta?.mediaType === "novel"
    && chapters.isActive
    && chaptersParent
    && chapters.activeChapter
    && chapters.items.findIndex(item => item.id === chapters.activeChapter?.id) > 0,
  );

  const novelStream = useNovelChapterStream({
    enabled: canUseNovelChapterStream,
    parent: chaptersParent,
    chapterItems: chapters.items,
    activeChapter: chapters.activeChapter,
    activeChapterDetail: selectedItem,
    detailLoading: chapters.detailLoading,
    canLoadMoreChapters: channelCapabilities.canLoadMoreChapters,
    hasMoreChapters: chapters.hasMore,
    loadMoreChapters: chapters.loadMore,
    channelId: chaptersDetailChannelId,
    runtimeBase,
    theme,
    scrollRootRef: readerPanelRef,
    onChapterDetailFetched: setNovelPlaybackChapter,
  });

  const novelChapterStreamActive = canUseNovelChapterStream && novelStream.slots.length > 0;

  useEffect(() => {
    const isNovelMode = chaptersPluginMeta?.mediaType === "novel"
      || selectedPluginMeta?.mediaType === "novel";
    if (!isNovelMode) {
      setNovelPlaybackChapter(null);
    }
  }, [chaptersPluginMeta?.mediaType, selectedPluginMeta?.mediaType]);

  const selectedItemImagePreviewEnabled = shouldEnableArticleImagePreview({
    isComicReaderContent,
    comicChapterStreamActive,
    pluginMediaType: selectedPluginMeta?.mediaType,
  });
  const selectedItemTTSEnabled = shouldEnableArticleTTS({
    isComicReaderContent,
    comicChapterStreamActive,
    pluginMediaType: selectedPluginMeta?.mediaType,
  });

  const comicToolbarChapter = comicStream.isActive
    ? (comicStream.visibleChapter ?? chapters.activeChapter ?? selectedItem)
    : novelStream.isActive
      ? (novelStream.visibleChapter ?? chapters.activeChapter ?? selectedItem)
      : (chapters.activeChapter ?? selectedItem);

  const toolbarNavChapterId = useMemo(() => {
    if (!chapters.isActive) return null;
    const candidates = [
      novelStream.visibleChapter?.id,
      comicStream.visibleChapter?.id,
      chapters.activeChapter?.id,
      selectedItem?.id,
    ].filter((id): id is string => Boolean(id));
    for (const id of candidates) {
      if (chapters.items.some(item => item.id === id)) return id;
    }
    return chapters.activeChapter?.id ?? null;
  }, [
    chapters.isActive,
    chapters.items,
    chapters.activeChapter?.id,
    novelStream.visibleChapter?.id,
    comicStream.visibleChapter?.id,
    selectedItem?.id,
  ]);

  const activeChapterId = toolbarNavChapterId
    ?? comicToolbarChapter?.id
    ?? chapters.activeChapter?.id
    ?? selectedItem?.id
    ?? null;

  const isMangaIntroPage = Boolean(
    isSerialIntroPage({
      mediaType: chaptersPluginMeta?.mediaType,
      chaptersActive: chapters.isActive,
      chapterItems: chapters.items,
      activeChapterId,
      isComicReaderContent,
      hasDisplayContent: Boolean(baseDisplayContent),
    }),
  );

  const selectedItemDisplayContent = useMemo(() => {
    if (!baseDisplayContent) return "";
    let content = baseDisplayContent;
    if (isMangaIntroPage) {
      content = prepareMangaIntroDisplayContent(content);
    } else if (chaptersPluginMeta?.mediaType === "novel") {
      content = enhanceNovelChapterDisplayContent(content, selectedItem?.title);
    }
    if (selectedAudioUrl) {
      content = stripEmbeddedAudioFromContent(content);
    }
    return content;
  }, [baseDisplayContent, isMangaIntroPage, chaptersPluginMeta?.mediaType, selectedItem?.title, selectedAudioUrl]);

  const isNovelReading = Boolean(
    (chaptersPluginMeta?.mediaType === "novel" && (chapters.isActive || selectedItem))
    || selectedPluginMeta?.mediaType === "novel",
  );

  const novelReaderStyle = isNovelReading
    ? novelReaderSettingsToStyle(novelReaderSettings)
    : undefined;

  const serialChapterItemLabel = resolveSerialChapterItemLabel(
    chaptersPluginMeta?.mediaType,
    channelCapabilities.chaptersItemLabel,
  );

  const playbackContentRef = novelChapterStreamActive
    ? novelStream.streamContainerRef
    : comicChapterStreamActive
      ? comicStream.streamContainerRef
      : articleContentRef;

  const playbackArticle = useMemo(() => {
    const raw = selectedItem ?? chapters.activeChapter;
    if (!raw) return null;
    const pluginId = raw.pluginId ?? chaptersParent?.pluginId ?? selectedPluginMeta?.id;
    if (!pluginId || raw.pluginId) return raw;
    return { ...raw, pluginId };
  }, [selectedItem, chapters.activeChapter, chaptersParent?.pluginId, selectedPluginMeta?.id]);
  const resumeChapterId = chapters.activeChapter?.id ?? selectedItem?.id ?? null;
  const inlinePlaybackChannelId = chaptersParent ? chaptersDetailChannelId : activeChannel;
  const inlinePlaybackContentSurfaceKey = novelChapterStreamActive
    ? "novel-stream"
    : comicChapterStreamActive
      ? "comic-stream"
      : isMangaIntroPage
        ? "novel-intro"
        : "article";
  const inlinePlaybackPluginMeta = chaptersParent
    ? (chaptersPluginMeta ?? activePluginMeta)
    : (selectedPluginMeta ?? activePluginMeta);
  const inlinePlaybackHistoryEnabled = activePlugin !== "all"
    ? isPlaybackHistoryEnabled(activePluginMeta, activeChannel, channelCapabilities)
    : isPlaybackHistoryEnabled(
      inlinePlaybackPluginMeta,
      chaptersParent ? activeChannel : inlinePlaybackChannelId,
      channelCapabilities,
    );
  const isInlinePlaybackEnabled = Boolean(
    playbackArticle && inlinePlaybackHistoryEnabled && isPageDetailView,
  );
  const inlineSessionId = playbackArticle
    ? `inline:${playbackArticle.pluginId}:${chaptersParent?.id ?? playbackArticle.id}`
    : undefined;

  const resolveInlineDockTarget = useCallback(() => {
    if (isSplitDetailMode && splitDetailArticle) {
      return {
        article: splitDetailArticle,
        parentArticle: null as Article | null,
        channel: splitDetailActiveChannel,
        inlineSessionId: splitDetailSessionId(splitDetailArticle),
        contentRoot:
          readerPanelRef.current?.querySelector<HTMLElement>(".orbit-detail-panel .article-reader")
          ?? null,
      };
    }

    const article = playbackArticle;
    if (!article) return null;

    return {
      article,
      parentArticle: chaptersParent,
      channel: activeChannel,
      inlineSessionId:
        inlineSessionId ?? `inline:${article.pluginId}:${chaptersParent?.id ?? article.id}`,
      contentRoot: articleContentRef.current,
    };
  }, [
    isSplitDetailMode,
    splitDetailArticle,
    splitDetailActiveChannel,
    playbackArticle,
    chaptersParent,
    activeChannel,
    inlineSessionId,
  ]);

  const canDockCurrentPage = activePlugin !== "all"
    && !isPluginFocusMode
    && (
      isPageDetailView
      || (isReaderPreviewMode && Boolean(playbackArticle))
      || (isSplitDetailMode && Boolean(splitDetailArticle))
    );
  const showContentLoading = contentLoading
    || chapters.detailLoading
    || (chapters.isActive && chapters.loading);
  const hasRenderableInlineContent = Boolean(
    comicPageUrls?.length
    || comicHtml
    || selectedItemDisplayContent
    || comicStream.slots.some(slot => slot.status === "ready")
    || (canUseNovelChapterStream && novelStream.slots.some(slot => slot.status === "ready")),
  );
  const showContentLoadingPlaceholder = showContentLoading && !hasRenderableInlineContent;
  usePlaybackProgress({
    pluginMeta: inlinePlaybackPluginMeta,
    channelId: inlinePlaybackChannelId,
    recordChannelId: chaptersParent ? activeChannel : inlinePlaybackChannelId,
    channelCapabilities: chaptersParent ? undefined : channelCapabilities,
    feedChannelId: chaptersParent ? activeChannel : undefined,
    feedChannelCapabilities: chaptersParent ? channelCapabilities : undefined,
    parentArticle: chaptersParent,
    article: playbackArticle,
    sessionId: inlineSessionId,
    contentRef: playbackContentRef,
    scrollRootRef: readerPanelRef,
    runtimeBase,
    contentReady: (
      novelChapterStreamActive
        ? novelStream.slots.some(slot => slot.status === "ready")
        : comicChapterStreamActive
          ? comicStream.slots.some(slot => slot.status === "ready")
          : Boolean(comicPageUrls?.length || comicHtml || selectedItemDisplayContent)
    ) && !showContentLoading,
    contentSurfaceKey: inlinePlaybackContentSurfaceKey,
    novelChapterRecord: novelPlaybackChapter ?? undefined,
    historyEnabled: inlinePlaybackHistoryEnabled,
    enabled: isInlinePlaybackEnabled,
  });

  const inlineDetailPluginMeta = playbackArticle
    ? pluginById.get(playbackArticle.pluginId)
    : undefined;

  useEffect(() => {
    detailResumeAppliedRef.current = false;
  }, [selectedItem?.id, chapters.activeChapter?.id, detailResumeIntent]);

  useEffect(() => {
    const contentRoot = novelChapterStreamActive
      ? novelStream.streamContainerRef.current
      : comicChapterStreamActive
        ? comicStream.streamContainerRef.current
        : articleContentRef.current;
    if (!contentRoot) return;

    const hasStreamContent = novelChapterStreamActive
      ? novelStream.slots.some(slot => slot.status === "ready")
      : comicChapterStreamActive
        ? comicStream.slots.some(slot => slot.status === "ready")
        : Boolean(comicPageUrls?.length || comicHtml);
    if (!hasStreamContent && !selectedItemDisplayContent) return;

    let unbindContentImages = () => {};
    let unbindTTS = () => {};

    if (!isComicReaderContent && !novelChapterStreamActive) {
      highlightArticleCode(contentRoot);
      unbindContentImages = bindArticleContentImagesWithPreview(contentRoot, runtimeBase, {
        onImagePreview: openImagePreview,
        previewEnabled: selectedItemImagePreviewEnabled,
      });
      unbindTTS = bindTTS(contentRoot, { enabled: selectedItemTTSEnabled });
      bindArticleContentPlayers(contentRoot, { sessionId: inlineSessionId, runtimeBase });
    } else if (isComicHtml) {
      unbindContentImages = bindArticleContentImagesWithPreview(contentRoot, runtimeBase, {
        previewEnabled: false,
      });
    } else if (novelChapterStreamActive) {
      highlightArticleCode(contentRoot);
      unbindContentImages = bindArticleContentImagesWithPreview(contentRoot, runtimeBase, {
        onImagePreview: openImagePreview,
        previewEnabled: selectedItemImagePreviewEnabled,
      });
      unbindTTS = bindTTS(contentRoot, { enabled: selectedItemTTSEnabled });
    }

    if (
      shouldApplyPlaybackResumeIntent(detailResumeIntent, resumeChapterId)
      && !detailResumeAppliedRef.current
      && !showContentLoading
    ) {
      detailResumeAppliedRef.current = true;
      seedPlaybackResumeSnapshot(
        inlineSessionId,
        detailResumeIntent!.progress,
        detailResumeIntent!.mode,
      );
      const mode = detailResumeIntent!.mode
        ?? resolveEffectivePlayback(inlineDetailPluginMeta, activeChannel, channelCapabilities).mode;
      applyPlaybackResume(mode, detailResumeIntent!.progress, {
        sessionId: inlineSessionId,
        contentRoot,
        scrollRoot: readerPanelRef.current,
        chapterId: detailResumeIntent!.chapterId,
        runtimeBase,
      });
    }

    return () => {
      unbindContentImages();
      unbindTTS();
      if (!isComicReaderContent && !novelChapterStreamActive) {
        destroyArticleContentPlayers(contentRoot);
      }
    };
  }, [
    selectedItemDisplayContent,
    comicPageUrls,
    comicHtml,
    isComicHtml,
    isComicReaderContent,
    comicChapterStreamActive,
    novelChapterStreamActive,
    useComicChapterStreamMode,
    comicStream.slots,
    comicStream.streamContainerRef,
    novelStream.slots,
    novelStream.streamContainerRef,
    runtimeBase,
    theme,
    inlineSessionId,
    detailResumeIntent,
    showContentLoading,
    inlineDetailPluginMeta,
    activeChannel,
    channelCapabilities,
    openImagePreview,
    bindTTS,
    selectedItemImagePreviewEnabled,
    selectedItemTTSEnabled,
    chapters.activeChapter?.id,
    selectedItem?.id,
  ]);

  const toggleChaptersDrawer = useCallback(() => {
    setChaptersDrawerOpen(open => !open);
  }, []);

  const chaptersOpenButton = chapters.isActive && !isSplitDetailMode && (isPageDetailView || isReaderPreviewMode) ? (
    <ChaptersOpenButton
      theme={theme}
      open={chaptersDrawerOpen}
      onClick={toggleChaptersDrawer}
    />
  ) : null;

  const chapterNeighbors = useMemo(() => {
    if (!chapters.isActive) {
      return {
        prev: null as Article | null,
        next: null as Article | null,
        activeIndex: null as number | null,
        canLoadMoreNext: false,
      };
    }
    return resolveSerialChapterNeighbors({
      chapterItems: chapters.items,
      activeChapterId,
      hasMoreChapters: chapters.hasMore && channelCapabilities.canLoadMoreChapters,
    });
  }, [
    chapters.isActive,
    chapters.items,
    chapters.hasMore,
    channelCapabilities.canLoadMoreChapters,
    activeChapterId,
  ]);

  const pageDetailSubtitle = useMemo(() => {
    if (!isPageDetailView && !(chapters.isActive && chaptersParent)) return null;

    const comicName = chaptersParent?.title ?? selectedItem?.title;
    if (!comicName) return null;

    if (chapters.isActive && chaptersParent) {
      const activeId = activeChapterId;
      const idx = activeId
        ? chapters.items.findIndex(item => item.id === activeId)
        : -1;
      if (idx < 0 && chapterNeighbors.activeIndex == null) return comicName;

      return formatComicChapterToolbarSubtitle({
        seriesTitle: comicName,
        chapterIndex: idx >= 0 ? idx : chapterNeighbors.activeIndex!,
        chapterLabel: serialChapterItemLabel,
        chapterTitle: comicToolbarChapter?.title ?? selectedItem?.title,
      });
    }

    return comicName;
  }, [
    isPageDetailView,
    chapters.isActive,
    chaptersParent,
    chapters.items,
    chapterNeighbors.activeIndex,
    channelCapabilities.chaptersItemLabel,
    serialChapterItemLabel,
    selectedItem?.title,
    comicToolbarChapter?.title,
    activeChapterId,
  ]);

  const goToChapter = useCallback((chapter: Article) => {
    setDetailResumeIntent(undefined);
    detailResumeAppliedRef.current = true;
    if (
      canUseNovelChapterStream
      && novelStream.slots.some(slot => slot.chapter.id === chapter.id)
      && novelStream.scrollToChapterInStream(chapter.id)
    ) {
      return;
    }
    if (readerPanelRef.current) {
      readerPanelRef.current.scrollTop = 0;
    }
    void chapters.selectChapter(chapter);
  }, [canUseNovelChapterStream, novelStream.slots, novelStream.scrollToChapterInStream, chapters.selectChapter]);

  const goToNextChapter = useCallback(() => {
    setDetailResumeIntent(undefined);
    detailResumeAppliedRef.current = true;
    if (chapterNeighbors.next) {
      if (
        canUseNovelChapterStream
        && novelStream.slots.some(slot => slot.chapter.id === chapterNeighbors.next!.id)
        && novelStream.scrollToChapterInStream(chapterNeighbors.next.id)
      ) {
        return;
      }
      if (readerPanelRef.current) {
        readerPanelRef.current.scrollTop = 0;
      }
      void chapters.selectChapter(chapterNeighbors.next);
      return;
    }
    if (readerPanelRef.current) {
      readerPanelRef.current.scrollTop = 0;
    }
    if (chapterNeighbors.canLoadMoreNext) {
      void chapters.selectRelativeChapter(1);
    }
  }, [
    chapterNeighbors.next,
    chapterNeighbors.canLoadMoreNext,
    canUseNovelChapterStream,
    novelStream.slots,
    novelStream.scrollToChapterInStream,
    chapters.selectChapter,
    chapters.selectRelativeChapter,
  ]);

  const chapterNavButtonClass = isDarkTheme(theme)
    ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50";

  const chapterToolbarNav = chapters.isActive && (chapterNeighbors.prev || chapterNeighbors.next || chapterNeighbors.canLoadMoreNext) ? (
    <>
      {chapterNeighbors.prev ? (
        <button
          type="button"
          onClick={() => goToChapter(chapterNeighbors.prev!)}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors align-middle ${chapterNavButtonClass}`}
          title={`上一${serialChapterItemLabel}：${chapterNeighbors.prev.title}`}
        >
          <Icon name="arrow-left" className="w-3.5 h-3.5" />
          <span>上一{serialChapterItemLabel}</span>
        </button>
      ) : null}
      {chapterNeighbors.next || chapterNeighbors.canLoadMoreNext ? (
        <button
          type="button"
          onClick={goToNextChapter}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors align-middle ${chapterNavButtonClass}`}
          title={chapterNeighbors.next
            ? `下一${serialChapterItemLabel}：${chapterNeighbors.next.title}`
            : `加载更多${serialChapterItemLabel}`}
        >
          <span>下一{serialChapterItemLabel}</span>
          <Icon name="arrow-left" className="w-3.5 h-3.5 rotate-180" />
        </button>
      ) : null}
    </>
  ) : null;

  const closePageDetail = useCallback(() => {
    setGridPageDetailOpen(false);
    setSelectedItem(null);
    detailResumeAppliedRef.current = false;
  }, []);

  const pageDetailBackButton = isPageDetailView ? (
    <button
      type="button"
      onClick={closePageDetail}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors align-middle ${chapterNavButtonClass}`}
      title="返回列表"
      aria-label="返回列表"
    >
      <Icon name="arrow-left" className="w-3.5 h-3.5" />
      <span>返回</span>
    </button>
  ) : null;

  const chapterPager = useMemo(() => {
    if (!shouldShowSerialChapterPager({
      mediaType: chaptersPluginMeta?.mediaType,
      chaptersActive: chapters.isActive,
      chapterItems: chapters.items,
      activeChapterId,
      isComicReaderContent,
      streamActive: comicChapterStreamActive || novelChapterStreamActive,
    })) {
      return null;
    }
    const { prev, next, canLoadMoreNext } = chapterNeighbors;
    if (!prev && !next && !canLoadMoreNext) return null;

    return (
      <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-3">
          {prev ? (
            <button
              type="button"
              onClick={() => goToChapter(prev)}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              title={`上一${serialChapterItemLabel}：${prev.title}`}
            >
              上一{serialChapterItemLabel}
            </button>
          ) : (
            <span />
          )}

          {next || canLoadMoreNext ? (
            <button
              type="button"
              onClick={goToNextChapter}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              title={next
                ? `下一${serialChapterItemLabel}：${next.title}`
                : `加载更多${serialChapterItemLabel}`}
            >
              下一{serialChapterItemLabel}
            </button>
          ) : null}
        </div>
      </div>
    );
  }, [
    chapters.isActive,
    chapters.items,
    chaptersPluginMeta?.mediaType,
    chapterNeighbors,
    goToChapter,
    goToNextChapter,
    isComicReaderContent,
    comicChapterStreamActive,
    novelChapterStreamActive,
    activeChapterId,
    serialChapterItemLabel,
  ]);

  const introStartReading = useMemo(() => {
    if (!chapters.isActive || !isMangaIntroPage) return null;
    const activeId = chapters.activeChapter?.id ?? null;
    if (!activeId) return null;
    const { next, canLoadMoreNext } = resolveSerialChapterNeighbors({
      chapterItems: chapters.items,
      activeChapterId: activeId,
      hasMoreChapters: chapters.hasMore && channelCapabilities.canLoadMoreChapters,
    });
    if (!next && !canLoadMoreNext) return null;

    return (
      <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800 flex justify-center">
        <button
          type="button"
          onClick={() => {
            if (next) {
              goToChapter(next);
              return;
            }
            goToNextChapter();
          }}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
          title={next ? `开始阅读：${next.title}` : "开始阅读"}
        >
          开始阅读
          <Icon name="arrow-left" className="w-4 h-4 rotate-180" />
        </button>
      </div>
    );
  }, [
    chapters.isActive,
    chapters.items,
    chapters.hasMore,
    chapters.activeChapter?.id,
    channelCapabilities.canLoadMoreChapters,
    isMangaIntroPage,
    goToChapter,
    goToNextChapter,
  ]);

  const handleItemSelect = useCallback((
    item: Article,
    resumeIntent?: PlaybackResumeIntent,
  ) => {
    const pluginMeta = pluginById.get(item.pluginId);
    if (isSocialPlugin(pluginMeta) && !shouldOpenSocialDetail(item, pluginMeta)) {
      void markArticleRead(item);
      return;
    }

    const requestId = ++itemSelectRequestRef.current;
    void markArticleRead(item);
    setAiSummary(null);
    setActiveImageIndex(0);
    detailResumeAppliedRef.current = false;

    const channelId = resolveArticleDetailChannel(
      item,
      pluginMeta,
      activeChannel,
      getStoredPluginChannel(item.pluginId),
    );

    void (async () => {
      const intent = resumeIntent ?? (
        isPlaybackHistoryEnabled(
          pluginMeta,
          activeChannel,
          channelCapabilities,
        )
          ? await fetchResumeIntentForArticle(item.pluginId, item.id, channelId)
          : undefined
      );

      if (requestId !== itemSelectRequestRef.current) return;

      setDetailResumeIntent(intent);

      if (
        shouldOpenChaptersForArticle(
          item,
          pluginMeta,
          activeChannel,
          channelCapabilities,
          getStoredPluginChannel(item.pluginId),
        )
      ) {
        const reopeningSameParent = chaptersParentRef.current?.id === item.id;
        setChaptersDrawerOpen(false);
        setSelectedItem(null);
        setChaptersParent(item);
        if (reopeningSameParent) {
          setChaptersOpenToken(token => token + 1);
        }
        return;
      }

      setChaptersParent(null);
      setSelectedItem(prev =>
        prev?.id === item.id
          ? mergeArticleListWithDetail(item, prev)
          : item,
      );
    })();
  }, [
    activeChannel,
    channelCapabilities,
    markArticleRead,
    pluginById,
  ]);

  useEffect(() => {
    if (pendingPluginRestoreRef.current === activePlugin) return;
    if (isGridPageMode && !gridPageDetailOpen) return;
    if (chaptersParent) return;
    if (suppressAutoSelectRef.current) {
      suppressAutoSelectRef.current = false;
      return;
    }
    if (visibleArticles.length === 0) {
      if (selectedItemRef.current?.pluginId === activePlugin) return;
      setSelectedItem(null);
      return;
    }

    const prev = selectedItemRef.current;
    if (prev) {
      const prevMatchesPlugin = activePlugin === "all" || prev.pluginId === activePlugin;
      if (prevMatchesPlugin) {
        const listItem = visibleArticles.find(a => a.id === prev.id);
        if (listItem) {
          const merged = mergeArticleListWithDetail(listItem, prev);
          if (merged !== prev) {
            setSelectedItem(merged);
          }
          return;
        }
      }
    }

    // Grid browse modes pick items explicitly (handleGridItemSelect / openReaderDetailModal).
    // Auto-selecting the first item here races with that click when page detail opens.
    if (isGridPreviewMode || isSocialFeedPreviewMode || isAudioFocusPreviewMode) return;

    const first = visibleArticles[0];
    if (first) {
      handleItemSelect(first);
    }
  }, [
    visibleArticles,
    chaptersParent,
    handleItemSelect,
    isGridPageMode,
    gridPageDetailOpen,
    activePlugin,
    isGridPreviewMode,
    isSocialFeedPreviewMode,
    isAudioFocusPreviewMode,
  ]);

  useEffect(() => {
    // Chapter switches manage their own scroll (goToChapter + novel/comic stream).
    if (chapters.isActive || restoringBrowseSessionRef.current) return;
    if (readerPanelRef.current) {
      readerPanelRef.current.scrollTop = 0;
    }
  }, [selectedItem?.id, chapters.isActive]);

  useEffect(() => {
    const itemId = selectedItem?.id;
    if (!itemId) {
      setContentLoading(false);
      return;
    }

    if (activePlugin !== "all" && selectedItem.pluginId !== activePlugin) {
      setContentLoading(false);
      return;
    }

    const pluginMeta = selectedItem
      ? pluginById.get(selectedItem.pluginId)
      : undefined;
    const channelId = resolveArticleDetailChannel(
      selectedItem,
      pluginMeta,
      activeChannel,
      getStoredPluginChannel(selectedItem.pluginId),
    );
    const itemHasDetail = resolveArticleHasDetail(
      selectedItem,
      pluginMeta,
      activeChannel,
      channelCapabilities,
      getStoredPluginChannel(selectedItem.pluginId),
    );
    if (shouldSkipFeedItemDetailFetch(selectedItem, pluginMeta, itemHasDetail)) {
      setContentLoading(false);
      return;
    }

    if (
      shouldUseRuntimeV2(selectedItem.pluginId, pluginMeta)
      && channelId !== "all"
      && !chapters.isActive
      && itemHasDetail
    ) {
      let cancelled = false;
      setContentLoading(true);
      void runtimeOpenDetail(selectedItem.pluginId, channelId, itemId, {
        ...browserSessionOptionsFromPlugin(pluginMeta),
      })
        .then(result => {
          if (cancelled || !result.item) return;
          setSelectedItem(prev =>
            prev?.id === itemId && result.item
              ? mergeArticleListWithDetail(prev, result.item)
              : prev,
          );
        })
        .catch(err => {
          if (!cancelled) console.error("load article content failed", err);
        })
        .finally(() => {
          if (!cancelled) setContentLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    if (chapters.isActive) {
      return;
    }

    if (shouldUseRuntimeV2(selectedItem.pluginId, pluginMeta)) {
      setContentLoading(false);
      return;
    }

    let cancelled = false;
    setContentLoading(true);
    void (async () => {
      try {
        const detail = await fetchFeedItem(itemId, {
          pluginId: selectedItem.pluginId,
          channelId,
        });
        if (cancelled) {
          return;
        }
        setSelectedItem(prev =>
          prev?.id === itemId ? mergeArticleListWithDetail(prev, detail) : prev,
        );
      } catch (err) {
        if (!cancelled) {
          console.error("load article content failed", err);
        }
      } finally {
        if (!cancelled) {
          setContentLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedItem?.id, selectedItem?.pluginId, pluginById, activeChannel, channelCapabilities, chapters.isActive, activePlugin]);

  const handleBookmarkToggle = (id: string) => {
    setBookmarkedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (selectedItem?.id === id) {
      setSelectedItem(prev =>
        prev ? { ...prev, isBookmarked: !prev.isBookmarked } : prev,
      );
    }
  };

  const handleTogglePluginFavoritesEnabled = (pluginId: string) => {
    setFavoritesEnabledPluginIds(prev => {
      const next = new Set(prev);
      if (next.has(pluginId)) {
        next.delete(pluginId);
        if (activePlugin === pluginId && isPluginFavoritesChannel(activeChannel)) {
          const resolved = resolvePluginChannel(pluginId);
          setActiveChannel(resolved);
        }
      } else {
        next.add(pluginId);
      }
      persistFavoritesEnabledPluginIds(next);
      return next;
    });
  };

  const handleTogglePluginFavorite = (article: Article, event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.();
    setFavoriteArticlesByPlugin(prev => {
      const next = toggleFavoriteArticleInMap(prev, article);
      persistFavoriteArticlesByPlugin(next);
      return next;
    });
  };

  const handleIgnoreArticle = (id: string) => {
    setIgnoredIds(prev => {
      const next = new Set(prev);
      next.add(id);
      persistIgnoredArticleIds(next);
      return next;
    });
  };

  const handleInstallPlugin = async (
    marketId: string,
    contentRating?: import("@/types").MarketPluginContentRating,
  ) => {
    await orbitInstallOfficialPlugin(marketId, contentRating);
  };

  const handleUpdatePlugin = async (
    marketId: string,
    pluginId: string,
    contentRating?: import("@/types").MarketPluginContentRating,
  ) => {
    await orbitUpdateOfficialPlugin(marketId, pluginId, contentRating);
  };

  const handleUninstallPlugin = async (id: string) => {
    await orbitRemovePlugin(id);
    if (activePlugin === id) {
      const groupId = getPluginGroupId(id);
      selectGroupAll(groupId);
    }
  };

  const handleTogglePluginActive = (id: string) => {
    void orbitTogglePluginActive(id).catch(console.error);
    if (activePlugin === id) {
      const target = myPlugins.find(p => p.id === id);
      if (target?.active !== false) {
        selectGroupAll(getPluginGroupId(id));
      }
    }
  };

  const handleTogglePluginIncludeInAll = (id: string) => {
    void orbitTogglePluginIncludeInAll(id).catch(console.error);
  };

  const handleMovePlugin = (id: string, direction: "up" | "down") => {
    orbitMovePlugin(id, direction);
  };

  const handleReorderPlugins = (orderedIds: string[]) => {
    orbitReorderPlugins(orderedIds);
  };

  const handleImportCustomPlugin = (
    payload: InstallRSSPluginRequest,
    targetGroupId?: string,
  ) => {
    const channels =
      payload.channels && payload.channels.length > 0
        ? payload.channels
        : payload.feedUrl?.trim()
          ? [
              {
                id: "main",
                label: "全部",
                feedUrl: payload.feedUrl.trim(),
              },
            ]
          : [];
    if (channels.length === 0) {
      return;
    }
    void (async () => {
      try {
        const plugin = await installCustomRSS({ ...payload, channels });
        if (targetGroupId) {
          assignPluginGroup(plugin.id, targetGroupId);
        }
      } catch (err) {
        console.error(err);
      }
    })();
  };

  const selectGroupAll = (groupId: string) => {
    if (activePlugin !== "all") {
      clearSearch();
      setPluginPreviewMode("reader");
    }
    setActivePlugin("all");
    setActiveChannel("all");
    setActivePluginGroupId(groupId);
    setActiveTab("all");
    setShowPluginStore(false);
  };

  const selectChannel = useCallback(
    (channelId: string) => {
      if (channelId !== activeChannel) {
        clearSearch();
        setFocusSearchOpen(false);
      }
      setActiveChannel(channelId);
      if (activePlugin === "all") return;
      const channel = (pluginById.get(activePlugin)?.channels ?? []).find(
        ch => ch.id === channelId,
      );
      const plugin = pluginById.get(activePlugin);
      if (
        channel
        && (!isChannelDynamic(channel) || isBrowseDynamicChannel(channel, plugin))
      ) {
        persistPluginChannel(activePlugin, channelId);
      }
    },
    [activeChannel, activePlugin, pluginById],
  );

  const openFocusSearch = useCallback(() => {
    if (isActiveDynamicChannel) {
      setFocusSearchOpen(true);
      return;
    }
    const searchChannel = findDynamicSearchChannel(activePluginChannels);
    if (searchChannel && searchChannel.id !== activeChannel) {
      selectChannel(searchChannel.id);
      return;
    }
    setFocusSearchOpen(true);
  }, [
    activeChannel,
    activePluginChannels,
    isActiveDynamicChannel,
    selectChannel,
  ]);

  const captureCurrentPluginBrowseSession = (
    pluginId: string,
    options?: { closePageDetail?: boolean },
  ) => {
    if (pluginId === "all") return;
    savePluginBrowseSession(pluginId, {
      selectedItem: selectedItemRef.current,
      gridPageDetailOpen: options?.closePageDetail ? false : gridPageDetailOpen,
      chaptersParent: chaptersParentRef.current,
      splitDetailArticle: splitDetailArticleRef.current,
      splitDetailFeedChannel,
      novelPlaybackChapter: novelPlaybackChapterRef.current,
      detailResumeIntent,
      scrollTop: readerPanelRef.current?.scrollTop ?? 0,
    });
  };

  const autoDockPlaybackBeforePluginLeave = useCallback((leavingPluginId: string): boolean => {
    let closePageDetail = false;

    setReaderSessions(prev => {
      let next = dockPlayingExpandedSessions(prev, leavingPluginId);
      const target = resolveInlineDockTarget();

      if (
        target
        && target.article.pluginId === leavingPluginId
        && hasInlinePlayableMedia(target.article)
        && isInlineMediaPlaying({
          article: target.article,
          sessionId: target.inlineSessionId,
          contentRoot: target.contentRoot,
          pluginId: leavingPluginId,
        })
      ) {
        const docked = dockInlinePlaybackToReaderSession({
          sessions: next,
          article: target.article,
          parentArticle: target.parentArticle,
          activeChannel: target.channel,
          hasDetail: resolveArticleHasDetail(
            target.article,
            pluginById.get(target.article.pluginId),
            target.channel,
            channelCapabilities,
            getStoredPluginChannel(target.article.pluginId),
          ),
          inlineSessionId: target.inlineSessionId,
          contentRoot: target.contentRoot,
        });
        next = docked.sessions;
        closePageDetail = docked.closePageDetail;
      }

      return next === prev ? prev : next;
    });

    return closePageDetail;
  }, [resolveInlineDockTarget, pluginById, channelCapabilities]);

  const selectPlugin = (pluginId: string, groupId?: string) => {
    if (pluginId !== activePlugin) {
      clearSearch();
    }
    if (
      activePlugin !== "all"
      && activePlugin !== pluginId
      && activeChannel !== "all"
    ) {
      const leavingPlugin = pluginById.get(activePlugin);
      const leavingChannel = (leavingPlugin?.channels ?? []).find(
        ch => ch.id === activeChannel,
      );
      if (
        isChannelDynamic(leavingChannel)
        && !isBrowseDynamicChannel(leavingChannel, leavingPlugin)
      ) {
        persistPluginChannel(activePlugin, resolvePluginChannel(activePlugin));
      }
    }
    const isSwitchingPlugin = pluginId !== activePlugin;
    let closePageDetailAfterDock = false;
    if (isSwitchingPlugin && activePlugin !== "all") {
      closePageDetailAfterDock = autoDockPlaybackBeforePluginLeave(activePlugin);
      captureCurrentPluginBrowseSession(activePlugin, {
        closePageDetail: closePageDetailAfterDock,
      });
    }
    if (closePageDetailAfterDock) {
      setGridPageDetailOpen(false);
    }
    setActivePlugin(pluginId);
    if (pluginId === "all") {
      setActiveChannel("all");
      if (groupId) {
        setActivePluginGroupId(groupId);
      }
      if (isSwitchingPlugin) {
        pendingPluginRestoreRef.current = null;
        setPluginPreviewMode("reader");
        setSelectedItem(null);
        setGridPageDetailOpen(false);
        setChaptersParent(null);
        setSplitDetailArticle(null);
        setSplitDetailFeedChannel(null);
        setNovelPlaybackChapter(null);
      }
      return;
    }
    setActiveChannel(resolvePluginChannel(pluginId));
    setActivePluginGroupId(groupId ?? getPluginGroupId(pluginId));
    setShowPluginStore(false);
    if (isSwitchingPlugin) {
      pendingPluginRestoreRef.current = pluginId;
      const saved = getStoredPluginPreviewMode(pluginId);
      setPluginPreviewMode(resolvePluginPreviewMode(pluginById.get(pluginId), saved));
    }
  };

  useEffect(() => {
    setPreviewModeMenuOpen(false);
    if (activePlugin === "all") {
      setPluginPreviewMode("reader");
      setGridDetailViewMode("modal");
      return;
    }
    const saved = getStoredPluginPreviewMode(activePlugin);
    const isNovelPlugin = activePluginMeta?.mediaType === "novel";
    setPluginPreviewMode(resolvePluginPreviewMode(activePluginMeta, saved));
    setGridColumnCount(getStoredGridColumnCount(activePlugin));
    setGridCoverAspectRatio(getStoredGridCoverAspectRatio(activePlugin, isNovelPlugin ? "3:4" : "1:1"));
    setGridDetailViewMode(getStoredGridDetailViewMode(activePlugin) ?? (isNovelPlugin ? "page" : "modal"));
    setVideoWallColumnCount(getStoredVideoWallColumnCount(activePlugin));
    setSplitPaneRatio(getStoredSplitPaneRatio(activePlugin));
    setSocialFeedWidth(getStoredSocialFeedWidth(activePlugin));
  }, [activePlugin, activePluginMeta]);

  useEffect(() => {
    if (pendingPluginRestoreRef.current) return;
    itemSelectRequestRef.current += 1;
    if (activePlugin !== "all") {
      setSelectedItem(prev => (prev && prev.pluginId !== activePlugin ? null : prev));
      setContentLoading(false);
    }
  }, [activePlugin]);

  useEffect(() => {
    const pluginId = pendingPluginRestoreRef.current;
    if (!pluginId || pluginId !== activePlugin) return;
    pendingPluginRestoreRef.current = null;

    const session = getPluginBrowseSession(pluginId);
    if (!session) return;

    restoringBrowseSessionRef.current = true;
    setSelectedItem(session.selectedItem);
    setGridPageDetailOpen(session.gridPageDetailOpen);
    setChaptersParent(session.chaptersParent);
    setSplitDetailArticle(session.splitDetailArticle);
    setSplitDetailFeedChannel(session.splitDetailFeedChannel);
    setNovelPlaybackChapter(session.novelPlaybackChapter);
    if (session.detailResumeIntent !== undefined) {
      setDetailResumeIntent(session.detailResumeIntent);
    }

    const scrollTop = session.scrollTop;
    requestAnimationFrame(() => {
      restoringBrowseSessionRef.current = false;
      if (scrollTop > 0 && readerPanelRef.current) {
        readerPanelRef.current.scrollTop = scrollTop;
      }
    });
  }, [activePlugin]);

  const prevActivePluginForChannelRef = useRef(activePlugin);
  useEffect(() => {
    if (prevActivePluginForChannelRef.current === activePlugin) {
      setGridPageDetailOpen(false);
    }
    prevActivePluginForChannelRef.current = activePlugin;
  }, [activeChannel, activePlugin]);

  useEffect(() => {
    if (gridDetailViewMode === "modal") {
      setGridPageDetailOpen(false);
    }
  }, [gridDetailViewMode]);

  useEffect(() => {
    if (pluginPreviewMode !== "grid") {
      setGridPageDetailOpen(false);
    }
  }, [pluginPreviewMode]);

  useEffect(() => {
    if (!isPluginFocusMode) {
      setFocusSearchOpen(false);
      return;
    }
    if (isActiveDynamicChannel) {
      setFocusSearchOpen(true);
    } else if (!submittedSearch) {
      setFocusSearchOpen(false);
    }
  }, [isPluginFocusMode, isActiveDynamicChannel, activeChannel, submittedSearch]);

  const isActiveImageGalleryPlugin = isImageGalleryPlugin(activePluginMeta);

  const closeReaderSession = useCallback((sessionId: string) => {
    setReaderSessions(prev => prev.filter(session => session.id !== sessionId));
  }, []);

  const closeDockedReaderSessions = useCallback((sessionIds: string[]) => {
    const ids = new Set(sessionIds);
    setReaderSessions(prev => prev.filter(session => !ids.has(session.id)));
  }, []);

  const dockReaderSession = useCallback((sessionId: string) => {
    setReaderSessions(prev =>
      prev.map(session =>
        session.id === sessionId
          ? { ...session, mode: "docked", autoDockOnDismiss: true }
          : session,
      ),
    );
  }, []);

  const updateReaderSessionArticle = useCallback((sessionId: string, article: Article) => {
    setReaderSessions(prev =>
      prev.map(session => {
        if (session.id !== sessionId) return session;
        if (
          session.article.content === article.content
          && session.article.videoUrl === article.videoUrl
          && session.article.audioUrl === article.audioUrl
          && session.article.galleryImages === article.galleryImages
        ) {
          return session;
        }
        return { ...session, article };
      }),
    );
  }, []);

  const expandReaderSession = useCallback((sessionId: string) => {
    setReaderSessions(prev =>
      prev.map(session => ({
        ...session,
        mode: session.id === sessionId ? "expanded" : "docked",
      })),
    );
  }, []);

  const openReaderDetailModal = useCallback((
    article: Article,
    resumeIntent?: PlaybackResumeIntent,
  ) => {
    void (async () => {
      const pluginMeta = pluginById.get(article.pluginId);
      const channelId = resolveArticleDetailChannel(
        article,
        pluginMeta,
        activeChannel,
        getStoredPluginChannel(article.pluginId),
      );
      let intent = resumeIntent;
      if (
        !intent
        && isPlaybackHistoryEnabled(pluginMeta, activeChannel, channelCapabilities)
      ) {
        intent = await fetchResumeIntentForArticle(article.pluginId, article.id, channelId);
      }

      const sessionHasDetail = resolveArticleHasDetail(
        article,
        pluginMeta,
        activeChannel,
        channelCapabilities,
        getStoredPluginChannel(article.pluginId),
      );
      setReaderSessions(prev => {
        const key = articleSessionKey(article);
        const existing = prev.find(session => articleSessionKey(session.article) === key);
        if (existing) {
          const nextResumeIntent = intent ?? existing.resumeIntent;
          seedPlaybackResumeSnapshot(existing.id, nextResumeIntent?.progress, nextResumeIntent?.mode);
          return prev.map(session => ({
            ...session,
            mode: session.id === existing.id ? "expanded" : "docked",
            resumeIntent: session.id === existing.id
              ? nextResumeIntent
              : session.resumeIntent,
          }));
        }
        const newSession = createReaderSession(
          article,
          activeChannel,
          sessionHasDetail,
          intent,
          shouldOpenChaptersForArticle(
            article,
            pluginMeta,
            activeChannel,
            channelCapabilities,
            getStoredPluginChannel(article.pluginId),
          )
            ? article
            : null,
        );
        seedPlaybackResumeSnapshot(newSession.id, intent?.progress, intent?.mode);
        return [
          ...prev.map(session => ({ ...session, mode: "docked" as const })),
          newSession,
        ];
      });
      void markArticleRead(article);
    })();
  }, [markArticleRead, activeChannel, channelCapabilities, pluginById]);

  const clearReaderSessionResume = useCallback((sessionId: string) => {
    setReaderSessions(prev =>
      prev.map(session =>
        session.id === sessionId
          ? { ...session, resumeIntent: undefined }
          : session,
      ),
    );
  }, []);

  const handlePlaybackResume = useCallback(async (record: PlaybackRecord) => {
    if (activePlugin === "all" || !activePluginMeta) return;
    setPlaybackHistoryOpen(false);
    try {
      const parentArticle = await resolveParentArticleForPlayback(
        record,
        activePlugin,
        filteredArticles,
      );
      const resumeIntent = playbackRecordToResumeIntent(record);

      if (isGridPreviewMode && gridDetailViewMode === "page") {
        setGridPageDetailOpen(true);
        handleItemSelect(parentArticle, resumeIntent);
        return;
      }

      openReaderDetailModal(parentArticle, resumeIntent);
    } catch (err) {
      console.error("resume playback failed", err);
    }
  }, [
    activePlugin,
    activePluginMeta,
    filteredArticles,
    gridDetailViewMode,
    handleItemSelect,
    isGridPreviewMode,
    openReaderDetailModal,
  ]);

  const handleSplitDetailSelect = useCallback((article: Article) => {
    setSplitDetailArticle(article);
    setSplitDetailFeedChannel(activeChannel);
    void markArticleRead(article);
  }, [activeChannel, markArticleRead]);

  const handleSplitDetailLoadMore = useCallback(() => {
    void loadMore().catch(console.error);
  }, [loadMore]);

  const handleSelectPreviewMode = useCallback((mode: PluginPreviewMode) => {
    if (activePlugin === "all") return;
    if (!isPreviewModeAllowedForPlugin(mode, activePluginMeta)) return;
    if (mode === "videoWall" || mode === "split" || mode === "splitDetail") {
      setReaderSessions(prev =>
        prev.map(session => {
          if (session.mode !== "expanded") return session;
          if (mode === "splitDetail") {
            return { ...session, mode: "docked", autoDockOnDismiss: true };
          }
          const promotedArticle = promoteArticleForSessionVideo(session.article);
          const videoSession = isDedicatedVideoReaderSession({
            ...session,
            article: promotedArticle,
          });
          if (!videoSession) return session;
          return {
            ...session,
            article: promotedArticle,
            mode: "docked",
            autoDockOnDismiss: true,
          };
        }),
      );
    }
    if (mode !== "splitDetail") {
      setSplitDetailArticle(null);
      setSplitDetailFeedChannel(null);
    }
    setPluginPreviewMode(mode);
    if (mode !== "videoWall") {
      persistPluginPreviewMode(activePlugin, mode);
    }
    setPreviewModeMenuOpen(false);
  }, [activePlugin, activePluginMeta]);

  const handleVideoWallExpandSession = useCallback((sessionId: string) => {
    if (pluginPreviewMode !== "split") {
      setPluginPreviewMode("grid");
      persistPluginPreviewMode(activePlugin, "grid");
    }
    expandReaderSession(sessionId);
  }, [activePlugin, expandReaderSession, pluginPreviewMode]);

  const handleVideoWallCloseSession = useCallback((sessionId: string) => {
    closeReaderSession(sessionId);
  }, [closeReaderSession]);

  useEffect(() => {
    if (pluginPreviewMode === "videoWall" && !showVideoWallPreviewOption && videoWallSessions.length === 0) {
      setPluginPreviewMode("grid");
    }
  }, [pluginPreviewMode, showVideoWallPreviewOption, videoWallSessions.length]);

  useEffect(() => {
    if (activePlugin === "all") return;
    const resolved = resolvePluginPreviewMode(activePluginMeta, pluginPreviewMode);
    if (resolved !== pluginPreviewMode) {
      setPluginPreviewMode(resolved);
    }
  }, [activePlugin, activePluginMeta, pluginPreviewMode]);

  const handleGridColumnCountChange = useCallback((count: GridColumnCount) => {
    setGridColumnCount(count);
    if (activePlugin !== "all") {
      persistGridColumnCount(activePlugin, count);
    }
  }, [activePlugin]);

  const handleGridCoverAspectRatioChange = useCallback((ratio: GridCoverAspectRatio) => {
    setGridCoverAspectRatio(ratio);
    if (activePlugin !== "all") {
      persistGridCoverAspectRatio(activePlugin, ratio);
    }
  }, [activePlugin]);

  const handleGridItemSelect = useCallback((article: Article) => {
    if (gridDetailViewMode === "page") {
      setGridPageDetailOpen(true);
      handleItemSelect(article);
      return;
    }
    openReaderDetailModal(article);
  }, [gridDetailViewMode, handleItemSelect, openReaderDetailModal]);

  const handleSocialFeedItemSelect = useCallback((article: Article) => {
    const pluginMeta = pluginById.get(article.pluginId);
    if (shouldOpenSocialDetail(article, pluginMeta)) {
      openReaderDetailModal(article);
      return;
    }
    void markArticleRead(article);
  }, [markArticleRead, openReaderDetailModal, pluginById]);

  const switchReaderToPageDetail = useCallback((
    sessionId: string,
    payload?: { openArticle: Article; resumeIntent?: PlaybackResumeIntent },
  ) => {
    const session = readerSessions.find(item => item.id === sessionId);
    if (!session && !payload) return;

    const openArticle = payload?.openArticle
      ?? session?.parentArticle
      ?? session?.article;
    if (!openArticle) return;

    let resumeIntent = payload?.resumeIntent;
    if (!resumeIntent && session) {
      resumeIntent = {
        ...session.resumeIntent,
        chapterId: session.parentArticle ? session.article.id : session.resumeIntent?.chapterId,
      };
    }

    closeReaderSession(sessionId);

    if (pluginPreviewMode !== "grid") {
      setPluginPreviewMode("grid");
      persistPluginPreviewMode(openArticle.pluginId, "grid");
    }
    persistGridDetailViewMode(openArticle.pluginId, "page");
    setGridDetailViewMode("page");
    setGridPageDetailOpen(true);
    handleItemSelect(openArticle, resumeIntent);
  }, [
    readerSessions,
    closeReaderSession,
    pluginPreviewMode,
    handleItemSelect,
  ]);

  const switchPageDetailToModal = useCallback(() => {
    if (!selectedItem || activePlugin === "all") return;

    const openArticle = chaptersParent ?? selectedItem;
    const pluginMeta = chaptersParent ? chaptersPluginMeta : selectedPluginMeta;
    const mode = resolveEffectivePlayback(pluginMeta, activeChannel, channelCapabilities).mode;

    let progress = detailResumeIntent?.progress;
    const progressRoot = articleContentRef.current;
    if (progressRoot) {
      const collected = mode === "manga"
        ? collectMangaPageProgress(progressRoot)
        : mode === "article"
          ? collectArticleScrollProgress(progressRoot)
          : undefined;
      if (hasMeaningfulProgress(collected)) {
        progress = collected;
      }
    }

    const resumeIntent: PlaybackResumeIntent = {
      chapterId: chaptersParent
        ? selectedItem.id
        : detailResumeIntent?.chapterId,
      progress,
      mode: detailResumeIntent?.mode ?? mode,
    };

    setGridPageDetailOpen(false);
    setSelectedItem(null);
    setChaptersParent(null);
    setChaptersDrawerOpen(false);
    detailResumeAppliedRef.current = false;
    persistGridDetailViewMode(activePlugin, "modal");
    setGridDetailViewMode("modal");
    openReaderDetailModal(openArticle, resumeIntent);
  }, [
    selectedItem,
    activePlugin,
    chaptersParent,
    chaptersPluginMeta,
    selectedPluginMeta,
    activeChannel,
    channelCapabilities,
    detailResumeIntent,
    openReaderDetailModal,
  ]);

  const handleGridDetailViewModeChange = useCallback((mode: GridDetailViewMode) => {
    if (activePlugin === "all") return;

    if (mode === "page" && isGridPreviewMode) {
      const expandedSession = readerSessions.find(
        session => session.mode === "expanded" && session.article.pluginId === activePlugin,
      );
      if (expandedSession) {
        switchReaderToPageDetail(expandedSession.id);
        return;
      }
    }

    if (mode === "modal" && isPageDetailView && selectedItem) {
      switchPageDetailToModal();
      return;
    }

    setGridDetailViewMode(mode);
    persistGridDetailViewMode(activePlugin, mode);
    if (mode !== "page") {
      setGridPageDetailOpen(false);
    }
  }, [
    activePlugin,
    isGridPreviewMode,
    isPageDetailView,
    readerSessions,
    selectedItem,
    switchPageDetailToModal,
    switchReaderToPageDetail,
  ]);

  const handleDockCurrentPage = useCallback(() => {
    const target = resolveInlineDockTarget();
    if (!target || activePlugin === "all") return;

    setReaderSessions(prev => {
      const result = dockInlinePlaybackToReaderSession({
        sessions: prev,
        article: target.article,
        parentArticle: target.parentArticle,
        activeChannel: target.channel,
        hasDetail: resolveArticleHasDetail(
          target.article,
          pluginById.get(target.article.pluginId),
          target.channel,
          channelCapabilities,
          getStoredPluginChannel(target.article.pluginId),
        ),
        inlineSessionId: target.inlineSessionId,
        contentRoot: target.contentRoot,
      });
      return result.sessions;
    });

    if (isPageDetailView) {
      setGridPageDetailOpen(false);
      setSelectedItem(null);
      detailResumeAppliedRef.current = false;
    } else if (isSplitDetailMode) {
      setSplitDetailArticle(null);
      setSplitDetailFeedChannel(null);
    } else if (isReaderPreviewMode) {
      suppressAutoSelectRef.current = true;
      setSelectedItem(null);
      setChaptersParent(null);
      detailResumeAppliedRef.current = false;
    }
  }, [
    activePlugin,
    channelCapabilities,
    isPageDetailView,
    isReaderPreviewMode,
    isSplitDetailMode,
    pluginById,
    resolveInlineDockTarget,
  ]);

  const pageDetailModalSwitchButton = isPageDetailView && isGridPreviewMode ? (
    <button
      type="button"
      onClick={switchPageDetailToModal}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors align-middle ${chapterNavButtonClass}`}
      title="切换到弹窗详情"
      aria-label="切换到弹窗详情"
    >
      <Icon name="pip" className="w-3.5 h-3.5" />
      <span>弹窗</span>
    </button>
  ) : null;

  const pageDockButton = canDockCurrentPage ? (
    <button
      type="button"
      onClick={handleDockCurrentPage}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors align-middle ${chapterNavButtonClass}`}
      title="挂起到侧栏，切换插件时继续播放"
      aria-label="挂起到侧栏"
    >
      <Icon name="pip" className="w-3.5 h-3.5" />
      <span>挂起</span>
    </button>
  ) : null;

  const handleVideoWallColumnCountChange = useCallback((count: GridColumnCount) => {
    setVideoWallColumnCount(count);
    if (activePlugin !== "all") {
      persistVideoWallColumnCount(activePlugin, count);
    }
  }, [activePlugin]);

  const handleSplitPaneRatioChange = useCallback((ratio: number) => {
    setSplitPaneRatio(ratio);
    if (activePlugin !== "all") {
      persistSplitPaneRatio(activePlugin, ratio);
    }
  }, [activePlugin]);

  useEffect(() => {
    if (!previewModeMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        previewModeMenuRef.current
        && !previewModeMenuRef.current.contains(event.target as Node)
      ) {
        setPreviewModeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [previewModeMenuOpen]);

  const handlePreviewModePrimaryClick = useCallback(() => {
    if (activePlugin === "all") return;
    setPreviewModeMenuOpen(open => !open);
  }, [activePlugin]);

  const clearGroupFeedScope = () => {
    setActivePluginGroupId(null);
  };

  return (
    <VideoSessionMountProvider active={isWallVideoActive}>
    <div className="orbit-shell h-screen flex flex-col font-sans transition-colors duration-300">
      
      {}
      <header
        data-tauri-drag-region
        onMouseDown={onTitlebarMouseDown}
        className={`app-titlebar app-titlebar-drag shrink-0 z-40 flex h-12 items-center justify-between border-b px-4 transition-colors duration-300 ${
          isDarkTheme(theme)
            ? "orbit-surface border-[var(--orbit-border)] backdrop-blur-md"
            : "bg-white border-neutral-100"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 select-none pointer-events-none">
          <img
            src={isDarkTheme(theme) ? orbitLogoWhite : orbitLogoBlack}
            alt=""
            className="h-7 w-7 shrink-0 object-contain"
            draggable={false}
          />
          <span
            className={`text-sm font-bold tracking-tight truncate ${
              isDarkTheme(theme) ? "text-white" : "text-black"
            }`}
          >
            ORBIT
          </span>
        </div>

        <div className="flex-1 self-stretch min-w-4" aria-hidden />

        {/* Right Section: Visual Layout Control Actions */}
        <div className="app-titlebar-no-drag flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setFeedPanelVisible(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
              feedPanelVisible
                ? "bg-transparent border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                : "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-400"
            }`}
            title={feedPanelVisible ? "隐藏左侧阅读列表" : "显示左侧阅读列表"}
          >
            <Icon name={feedPanelVisible ? "collapse" : "expand"} className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {feedPanelVisible ? "隐藏左侧列表" : "显示左侧列表"}
            </span>
          </button>

          {experienceMode === "full" ? (
            <div
              className="relative shrink-0"
              aria-label="系统级别标识"
              title={`使用 ${EXPERIENCE_MODE_SHORTCUT_LABEL} 切换级别`}
            >
              <span
                className={`inline-flex items-center gap-2 px-2 py-1 rounded-lg border text-[11px] font-semibold ${
                  isDarkTheme(theme)
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-700"
                }`}
              >
                <Icon name="sparkles" className="w-3.5 h-3.5 shrink-0" />
                完整级
                <span
                  className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                    isDarkTheme(theme)
                      ? "bg-amber-500/15 text-amber-200"
                      : "bg-amber-500/15 text-amber-800"
                  }`}
                >
                  18+
                </span>
              </span>
            </div>
          ) : null}

          <ThemeSwitcher
            theme={theme}
            onThemeChange={setTheme}
          />
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden relative">
        
        {}
        <aside className={`h-full flex flex-col justify-between border-r transition-all duration-300 ${
          isDarkTheme(theme) ? 'orbit-surface border-[var(--orbit-border)]' : 'bg-white border-neutral-100'
        } ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          
          <div className="shrink-0 pt-3">
            {/* Sidebar collapse toggle */}
            <div
              className={`mb-1 pb-1 border-b ${isDarkTheme(theme) ? "border-[var(--orbit-border)]" : "border-neutral-100"} ${isSidebarCollapsed ? "px-0" : "px-3"}`}
            >
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className={`w-full flex items-center py-1 rounded-lg text-xs transition-all duration-200 ${
                  isSidebarCollapsed ? "justify-center px-0" : "gap-2 px-2"
                } ${
                  isDarkTheme(theme)
                    ? "text-neutral-400 hover:bg-neutral-800/50"
                    : "text-neutral-500 hover:bg-neutral-50"
                }`}
                title={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
              >
                <Icon
                  name={isSidebarCollapsed ? "expand" : "collapse"}
                  className="w-3.5 h-3.5 shrink-0"
                />
                {!isSidebarCollapsed && (
                  <span className="font-medium">收起侧栏</span>
                )}
              </button>
            </div>

            {/* Top Navigation Items (Today, Bookmarks, Trending) */}
            <div className={`space-y-1 ${isSidebarCollapsed ? "px-0" : "px-3"}`}>
              <div className={`flex items-center justify-between text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2 px-3 ${
                isSidebarCollapsed ? 'hidden' : 'block'
              }`}>
                <span>视图大盘</span>
                <button
                  type="button"
                  onClick={handleSidebarRefresh}
                  disabled={isSidebarRefreshing}
                  className="hover:text-indigo-600 transition-colors disabled:opacity-50"
                  title="刷新资讯（使用缓存）"
                >
                  <Icon
                    name="refresh"
                    className={`w-3 h-3 ${isSidebarRefreshing ? "animate-spin" : ""}`}
                  />
                </button>
              </div>

              <button 
                onClick={() => {
                  setShowPluginStore(false);
                  setActiveTab('today');
                  clearGroupFeedScope();
                  selectPlugin('all');
                }}
                className={`w-full flex items-center py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  isSidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
                  activeTab === 'today' && activePlugin === 'all' && activePluginGroupId == null
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
                title="Today 全部资讯"
              >
                <div className="relative">
                  <Icon name="today" className="w-5 h-5 text-indigo-500" />
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                </div>
                {!isSidebarCollapsed && (
                  <div className="flex-1 flex items-center justify-between">
                    <span>Today 全部</span>
                    <span className="text-[10px] bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 px-1.5 py-0.5 rounded-md font-semibold">
                      未读 {unreadTotal}
                    </span>
                  </div>
                )}
              </button>

              <button 
                onClick={() => {
                  setShowPluginStore(false);
                  setActiveTab('bookmarks');
                  clearGroupFeedScope();
                  selectPlugin('all');
                }}
                className={`w-full flex items-center py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  isSidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
                  activeTab === 'bookmarks'
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
                title="Bookmarks 二创/草稿"
              >
                <Icon name="bookmark" className="w-5 h-5 text-rose-500" />
                {!isSidebarCollapsed && (
                  <div className="flex-1 flex items-center justify-between">
                    <span>Bookmarks 收藏</span>
                    <span className="text-[10px] bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 px-1.5 py-0.5 rounded-md font-semibold">
                      {articlesWithBookmarks.filter(a => a.isBookmarked).length}
                    </span>
                  </div>
                )}
              </button>

              <button 
                onClick={() => {
                  setShowPluginStore(false);
                  setActiveTab('trending');
                  clearGroupFeedScope();
                  selectPlugin('all');
                }}
                className={`w-full flex items-center py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  isSidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
                  activeTab === 'trending'
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
                title="Trending 爆款高赞"
              >
                <Icon name="trending" className="w-5 h-5 text-amber-500" />
                {!isSidebarCollapsed && (
                  <div className="flex-1 flex items-center justify-between">
                    <span>Trending 爆款</span>
                    <span className="text-xs text-neutral-400">HOT</span>
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Plugin Section — scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-3">
            <div className={`mt-3 space-y-1 ${isSidebarCollapsed ? "px-0" : "px-3"}`}>
              <div className={`flex items-center justify-between text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2 px-3 ${
                isSidebarCollapsed ? 'hidden' : 'block'
              }`}>
                <span>已启用的获取插件</span>
                <button
                  type="button"
                  onClick={handleSidebarRefresh}
                  disabled={isSidebarRefreshing}
                  className="hover:text-indigo-600 transition-colors disabled:opacity-50"
                  title="刷新插件与资讯（使用缓存）"
                >
                  <Icon
                    name="refresh"
                    className={`w-3 h-3 ${isSidebarRefreshing ? "animate-spin" : ""}`}
                  />
                </button>
              </div>

              {(() => {
                const renderPluginButton = (plugin: Plugin) => (
                  <button
                    key={plugin.id}
                    type="button"
                    onClick={() => {
                      selectPlugin(plugin.id);
                      setActiveTab("all");
                    }}
                    className={`w-full flex items-center py-2.5 rounded-xl text-sm transition-all duration-200 ${
                      isSidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
                    } ${
                      activePlugin === plugin.id
                        ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium"
                        : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    }`}
                    title={plugin.name}
                  >
                    <PluginAvatar
                      plugin={plugin}
                      className="w-5 h-5 rounded-md"
                      textClassName="text-[10px]"
                    />
                    {!isSidebarCollapsed && (
                      <div className="flex-1 flex items-center justify-between min-w-0">
                        <span className="truncate">{plugin.name}</span>
                        {plugin.id !== "all" && plugin.active !== false && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        )}
                      </div>
                    )}
                  </button>
                );

                if (isSidebarCollapsed) {
                  const seenPluginIds = new Set<string>();
                  return sidebarPluginGroups
                    .filter(({ group }) => !isGroupCollapsed(group.id))
                    .flatMap(({ plugins }) => plugins)
                    .filter(plugin => {
                      if (seenPluginIds.has(plugin.id)) return false;
                      seenPluginIds.add(plugin.id);
                      return true;
                    })
                    .map(renderPluginButton);
                }

                return sidebarPluginGroups.map(({ group, plugins }) => {
                  if (isGroupCollapsed(group.id)) {
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => togglePluginGroupCollapsed(group.id)}
                        className="w-full px-3 py-1.5 rounded-lg text-[10px] text-neutral-400 hover:text-indigo-600 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors text-left truncate"
                        title="显示分组"
                      >
                        显示「{group.label}」
                      </button>
                    );
                  }

                  return (
                    <div key={group.id} className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => togglePluginGroupCollapsed(group.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-neutral-400 uppercase tracking-wider hover:text-indigo-600 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                        title="收起分组（从侧栏隐藏）"
                      >
                        <Icon
                          name="expand"
                          className="w-3 h-3 shrink-0 transition-transform rotate-90"
                        />
                        <span className="flex-1 text-left truncate">{group.label}</span>
                        <span className="text-neutral-400 font-normal normal-case">
                          {plugins.length}
                        </span>
                      </button>
                      {plugins.map(renderPluginButton)}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Bottom App Footer */}
          <div className={`orbit-sidebar-footer ${isSidebarCollapsed ? "p-2" : "p-3"}`}>
            <button
              type="button"
              onClick={() => setShowPluginStore(true)}
              className={`orbit-sidebar-add-plugin w-full flex items-center justify-center rounded-xl text-xs font-semibold ${
                isSidebarCollapsed ? "p-2" : "gap-2 py-2 px-3"
              }`}
            >
              <Icon name="puzzle" className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span>添加/自定新插件</span>}
              {appUpdateSummary.updateAvailable ? (
                <span
                  className="inline-flex h-2 w-2 rounded-full bg-rose-500 shrink-0"
                  aria-label="发现新版本"
                />
              ) : null}
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-row h-full overflow-hidden transition-all duration-300">
          {showPluginStore ? (
            <PluginManagerModal
              theme={theme}
              experienceMode={experienceMode}
              myPlugins={myPlugins}
              pluginGroups={pluginGroups}
              groupedPluginsForManage={managePluginGroups}
              getPluginGroupId={getPluginGroupId}
              onClose={() => setShowPluginStore(false)}
              onInstall={handleInstallPlugin}
              onUpdate={handleUpdatePlugin}
              onUninstall={handleUninstallPlugin}
              onToggleActive={handleTogglePluginActive}
              onToggleIncludeInAll={handleTogglePluginIncludeInAll}
              onToggleFavoritesEnabled={handleTogglePluginFavoritesEnabled}
              favoritesEnabledPluginIds={favoritesEnabledPluginIds}
              onMove={handleMovePlugin}
              onReorder={handleReorderPlugins}
              onImport={handleImportCustomPlugin}
              onRefresh={() => {
                void reload().catch(console.error);
              }}
              onForceRefresh={async (pluginId) => {
                await orbitForceRefreshPlugin(pluginId);
              }}
              onSaveManifest={async (pluginId, manifestText) => {
                await orbitSavePluginManifest(pluginId, manifestText);
                await reload();
              }}
              onAssignPluginGroup={assignPluginGroup}
              onAddPluginGroup={addPluginGroup}
              onRenamePluginGroup={renamePluginGroup}
              onMovePluginGroup={movePluginGroup}
              onRemovePluginGroup={removePluginGroup}
              embedded
              appUpdateSummary={appUpdateSummary}
              onAppUpdateSummaryChange={setAppUpdateSummary}
            />
          ) : (
            <>
          {}
          <section className={`w-full md:w-80 lg:w-96 h-full flex flex-col border-r border-l transition-all duration-300 ${
            isDarkTheme(theme) ? 'orbit-surface border-[var(--orbit-border)]' : 'bg-white border-neutral-100'
          } ${hideFeedPanel ? 'hidden' : 'flex'}`}>
            
            {/* Search Column Container */}
            <div className="p-4 border-b orbit-feed-panel-header space-y-3">
              {!isBrowseDynamicPluginActive && (
                <div className={`relative flex items-center rounded-xl p-1 transition-all ${
                  isDarkTheme(theme) ? 'orbit-surface-elevated' : 'bg-[#f0f4f9]'
                }`}>
                  <div className="pl-3 pr-2 text-neutral-400">
                    <Icon name="search" className="w-4 h-4" />
                  </div>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitSearch();
                      }
                    }}
                    placeholder="搜索文章标题、摘要、标签…（回车搜索）"
                    className="w-full py-1.5 bg-transparent text-sm outline-none placeholder-neutral-400 dark:placeholder-neutral-500"
                  />
                  {searchQuery && (
                    <button 
                      onClick={clearSearch}
                      className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full"
                    >
                      <Icon name="close" className="w-3.5 h-3.5 text-neutral-500" />
                    </button>
                  )}
                </div>
              )}

              {/* Feed filters: media types (all platforms) or plugin channels */}
              {(activePlugin === "all" || showPluginChannelBar) && (
                <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                  {activePlugin === "all"
                    ? (
                      [
                        { id: "all", label: "全部" },
                        { id: "text", label: "资讯" },
                        { id: "video", label: "视频" },
                        { id: "audio", label: "音频" },
                        { id: "image", label: "图片" },
                      ] as const satisfies ReadonlyArray<{
                        id: CategoryFilter;
                        label: string;
                      }>
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveCategory(cat.id)}
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                          activeCategory === cat.id
                            ? "orbit-filter-chip orbit-filter-chip--active"
                            : "orbit-filter-chip"
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))
                    : (
                      !isSplitDetailMode && !(isGridPageMode && gridPageDetailOpen) ? (
                      <PluginChannelBar
                        activeChannel={activeChannel}
                        channels={activePluginChannels}
                        onChannelChange={selectChannel}
                      />
                      ) : null
                    )}
                </div>
              )}
            </div>

            {/* Scrollable list of feeds */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
              <div className="flex items-center justify-between text-xs orbit-text-subtle mb-2 gap-2">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  {activeTab === "bookmarks"
                    ? "收藏的文章"
                    : activeTab === "trending"
                      ? "Trending 爆款"
                      : activePlugin === "all" && activeGroupLabel
                        ? `${activeGroupLabel} · 全部平台`
                        : activePlugin === "all"
                          ? "Today 全部文章"
                          : pluginById.get(activePlugin)?.name ?? "文章列表"}
                  {isActiveDynamicChannel && !isBrowseDynamicPluginActive && (
                    <span
                      title="实时搜索"
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 shrink-0"
                    >
                      <Icon name="sparkles" className="w-2.5 h-2.5" />
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {showFeedChannelActions ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleFeedRefresh}
                        disabled={feedListBusy}
                        title="刷新"
                        className="p-1 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Icon name="refresh" className={`w-3.5 h-3.5 ${feedRefreshing ? "animate-spin" : ""}`} />
                      </button>
                      {showPlaybackHistoryButton && activePluginMeta ? (
                        <PlaybackHistoryButton
                          plugin={activePluginMeta}
                          channelId={activeChannel}
                          onClick={() => setPlaybackHistoryOpen(true)}
                          className="p-1 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <span>
                    {feedListBusy
                      ? "加载中…"
                      : isFavoritesChannelActive
                        ? `共 ${listDisplayArticles.length} ${feedCountUnit(activePluginMeta)}`
                        : isBrowseDynamicPluginActive
                        ? `共 ${feedTotal || listDisplayArticles.length} ${feedCountUnit(activePluginMeta)}`
                        : isActiveDynamicChannel
                          ? submittedSearch
                            ? `共 ${feedTotal} 条结果`
                            : "实时搜索"
                          : `共 ${submittedSearch ? feedTotal : listDisplayArticles.length} ${feedCountUnit(activePluginMeta)}`}
                  </span>
                </div>
              </div>

              {feedLoading && !isFavoritesChannelActive ? (
                <div className="text-center py-12">
                  <p className="text-sm text-neutral-400">正在拉取 RSS 订阅…</p>
                </div>
              ) : feedError && !isFavoritesChannelActive ? (
                <div className="text-center py-12 px-4">
                  <p className="text-sm text-rose-500">Feed 加载失败：{feedError}</p>
                  <p className="text-xs text-neutral-400 mt-2">请确认 Go runtime 已启动（make dev-go）</p>
                </div>
              ) : listDisplayArticles.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 rounded-full bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3">
                    <Icon name="search" className="w-6 h-6 text-neutral-400" />
                  </div>
                  <p className="text-sm text-neutral-400">
                    {isFavoritesChannelActive
                      ? "暂无收藏内容，点击爱心即可收藏"
                      : feedSearching
                      ? "正在搜索…"
                      : isBrowseDynamicPluginActive
                        ? isImageGalleryPlugin(activePluginMeta)
                          ? "暂无图片"
                          : "暂无内容"
                        : isActiveDynamicChannel && !submittedSearch
                          ? "输入关键词后按回车进行实时搜索"
                          : "未找到符合条件的资讯资源"}
                  </p>
                </div>
              ) : (
                <>
                  {feedSearching && (
                    <p className="text-center text-xs text-neutral-400 py-1">正在搜索…</p>
                  )}
                  {listDisplayArticles.map((item) => {
                    const isSelected =
                      (selectedItem && selectedItem.id === item.id)
                      || (chaptersParent != null && chaptersParent.id === item.id);
                    const isUnread = !item.isRead;
                    const pluginMeta = pluginById.get(item.pluginId);
                    const itemFavoritesEnabled = favoritesEnabledPluginIds.has(item.pluginId);
                    const itemFavorited = itemFavoritesEnabled
                      && (favoriteArticlesByPlugin[item.pluginId] ?? []).some(a => a.id === item.id);
                    if (isSocialPlugin(pluginMeta)) {
                      return (
                        <SocialFeedCard
                          key={item.id}
                          article={itemFavoritesEnabled ? { ...item, isBookmarked: itemFavorited } : item}
                          runtimeBase={runtimeBase}
                          isSelected={Boolean(isSelected)}
                          isUnread={isUnread}
                          onSelect={() => handleItemSelect(item)}
                          onIgnore={(e) => {
                            e.stopPropagation();
                            handleIgnoreArticle(item.id);
                          }}
                          onBookmark={(e) => {
                            e.stopPropagation();
                            if (itemFavoritesEnabled) {
                              handleTogglePluginFavorite(item, e);
                            } else {
                              handleBookmarkToggle(item.id);
                            }
                          }}
                          failedThumbnail={failedThumbnailIds.has(item.id)}
                          onThumbnailError={() => {
                            setFailedThumbnailIds(prev => new Set(prev).add(item.id));
                          }}
                        />
                      );
                    }
                    return (
                      <div 
                        key={item.id}
                        onClick={() => handleItemSelect(item)}
                        className={`group relative p-3.5 rounded-2xl cursor-pointer transition-all duration-300 border-[0.5px] orbit-feed-card ${
                          isSelected ? "orbit-feed-card--selected" : ""
                        }`}
                      >
                        <div className="flex gap-3 items-start">
                          <div className="flex-1 min-w-0">
                            {/* Platform Tag & Resource Type Icon */}
                            <div className="flex items-center gap-1.5 mb-1">
                              {pluginMeta ? (
                                <PluginAvatar
                                  plugin={pluginMeta}
                                  className="w-2.5 h-2.5 rounded-full"
                                  textClassName="text-[5px]"
                                />
                              ) : (
                                <div className="w-2.5 h-2.5 rounded-full bg-neutral-800" />
                              )}
                              <span className="text-[11px] font-medium orbit-feed-card-meta">{item.pluginName}</span>
                              <span className="text-[10px] orbit-text-subtle">•</span>
                              <div className="orbit-feed-card-meta group-hover:text-[var(--orbit-accent)] transition-colors">
                                <Icon name={item.type} className="w-3 h-3" />
                              </div>
                            </div>

                            <h4 className={`text-sm font-semibold leading-snug line-clamp-2 transition-colors ${
                              isSelected ? "orbit-feed-card-title--selected" : "orbit-feed-card-title"
                            }`}>
                              {item.title}
                            </h4>
                            {item.summary && (
                              <p className="text-xs orbit-feed-card-summary line-clamp-2 mt-0.5 leading-snug">
                                {item.summary}
                              </p>
                            )}
                          </div>

                          {isUnread && (
                            <span
                              className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"
                              title="未读"
                            />
                          )}

                          {item.image?.trim() && !failedThumbnailIds.has(item.id) && (
                            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-neutral-100 relative">
                              <ProxiedImage
                                runtimeBase={runtimeBase}
                                src={item.image}
                                alt="Thumbnail"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={() => {
                                  setFailedThumbnailIds(prev => new Set(prev).add(item.id));
                                }}
                              />
                              {/* Overlay media badge */}
                              {item.type !== 'text' && (
                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                  <Icon name={item.type} className="w-4 h-4 text-white drop-shadow" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Footer specs inside card */}
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-dashed orbit-feed-card-divider text-[10px] orbit-feed-card-meta">
                          <div className="flex items-center gap-2">
                            <span>{item.author}</span>
                            <span>•</span>
                            <span>{item.time}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span>{item.reads}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleIgnoreArticle(item.id);
                              }}
                              className="p-1 orbit-feed-card-action rounded-full"
                              title="忽略此文章"
                            >
                              <Icon name="eye-off" className="w-3 h-3 orbit-feed-card-meta" />
                            </button>
                            {itemFavoritesEnabled ? (
                              <FavoriteHeartButton
                                favorited={itemFavorited}
                                onToggle={(e) => handleTogglePluginFavorite(item, e)}
                                className="p-1 orbit-feed-card-action rounded-full"
                                iconClassName="w-3 h-3"
                              />
                            ) : (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBookmarkToggle(item.id);
                                }}
                                className="p-1 orbit-feed-card-action rounded-full"
                                title="收藏"
                              >
                                <Icon name="bookmark" className="w-3 h-3 orbit-feed-card-meta" active={item.isBookmarked} />
                              </button>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })}
                  {!isFavoritesChannelActive && (feedHasMore || (channelCapabilities.canLoadMore && listDisplayArticles.length > 0)) && (
                    <button
                      type="button"
                      onClick={() => {
                        void loadMore().catch(console.error);
                      }}
                      disabled={feedLoadingMore}
                      className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 py-2.5 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      {feedLoadingMore ? "加载中…" : `加载更多（${feedPageSize}条）`}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          {}
          <section
            className={`flex-1 h-full flex flex-row min-h-0 overflow-hidden transition-all duration-300 ${
            isDarkTheme(theme) ? 'bg-transparent' : 'bg-[#fafafa]'
          }`}
          >
            <div
              ref={readerPanelRef}
              className={`flex-1 h-full min-w-0 ${
                isSplitPaneLayout || isAudioFocusPreviewMode ? "overflow-hidden" : "overflow-y-auto"
              } ${isDarkTheme(theme) ? "bg-transparent" : "bg-[#fafafa]"}`}
            >
            
            {isPluginFocusMode || selectedItem || chapters.isActive ? (
              <div className={
                isSplitPaneLayout || isAudioFocusPreviewMode
                  ? "flex h-full min-h-0 w-full flex-col px-6"
                  : "w-full px-6 pb-8 md:pb-10"
              }>
                {/* Reader toolbar — sticky near top */}
                <div
                  className={`${isSplitPaneLayout || isAudioFocusPreviewMode ? "shrink-0" : "sticky top-0"} z-10 -mx-6 px-6 pt-2 pb-2 ${isDarkTheme(theme) ? "bg-transparent" : "bg-[#fafafa]"}`}
                >
                  <div
                    className={`rounded-xl border transition-all duration-200 ${
                      isDarkTheme(theme)
                        ? "orbit-surface-elevated border-[var(--orbit-border)]"
                        : "bg-white border-neutral-100"
                    } shadow-sm`}
                  >
                    <div className="flex items-center gap-2 p-2.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (isGridPageMode && gridPageDetailOpen) closePageDetail();
                          }}
                          title="返回列表"
                          className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400 px-2 py-1 rounded-lg shrink-0 inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                        >
                          {(isPluginFocusMode ? activePluginMeta : selectedPluginMeta) ? (
                            <PluginAvatar
                              plugin={(isPluginFocusMode ? activePluginMeta : selectedPluginMeta)!}
                              className="w-4 h-4 rounded-md"
                              textClassName="text-[8px]"
                            />
                          ) : null}
                          {isPluginFocusMode
                            ? activePluginMeta?.name
                            : selectedItem?.pluginName}
                        </button>
                        {pageDetailSubtitle ? (
                          <span className="text-xs text-neutral-400 truncate">
                            {pageDetailSubtitle}
                          </span>
                        ) : null}
                        {isWaterfallPreviewMode && activePlugin !== "all" ? (
                          <span className="text-xs text-neutral-400 truncate">
                            {isActiveImageGalleryPlugin
                              ? `图片观赏 · 共 ${pluginFeedArticles.length} 张`
                              : `瀑布流 · 共 ${pluginFeedArticles.length} 条`}
                          </span>
                        ) : null}
                        {!isPluginFocusMode && selectedItem && !pageDetailSubtitle ? (
                          <span className="text-xs text-neutral-400 truncate">
                            由 {selectedItem.author} 撰写
                          </span>
                        ) : null}
                        {isSocialFeedPreviewMode && activePlugin !== "all" ? (
                          <span className="text-xs text-neutral-400 truncate">
                            推文展示 · 共 {pluginFeedArticles.length} 条
                          </span>
                        ) : null}
                        {isGridPreviewMode && activePlugin !== "all" && !pageDetailSubtitle ? (
                          <span className="text-xs text-neutral-400 truncate">
                            卡片视图 · 共 {pluginFeedArticles.length} 条
                          </span>
                        ) : null}
                        {isSplitBroadcastMode && activePlugin !== "all" ? (
                          <span className="text-xs text-neutral-400 truncate">
                            联播分屏 · 卡片 {pluginFeedArticles.length} 条 · 视频 {splitWallSessions.length} 路
                          </span>
                        ) : null}
                        {isSplitDetailMode && activePlugin !== "all" ? (
                          <span className="text-xs text-neutral-400 truncate">
                            阅览分屏 · 卡片 {pluginFeedArticles.length} 条
                            {splitDetailArticle ? ` · 已选「${splitDetailArticle.title}」` : ""}
                          </span>
                        ) : null}
                        {isAudioFocusPreviewMode && activePlugin !== "all" ? (
                          <span className="text-xs text-neutral-400 truncate">
                            音频模式 · 共 {pluginFeedArticles.length} 首
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-end gap-1 shrink-0 ml-auto">
                        {isComicReaderContent ? (
                          <ComicPageWidthSlider
                            theme={theme}
                            value={comicPageWidth}
                            onChange={handleComicPageWidthChange}
                            className="mx-1"
                          />
                        ) : isReaderPreviewMode
                          && Boolean(selectedItem || chapters.isActive)
                          && !isNovelReading ? (
                          <ComicPageWidthSlider
                            theme={theme}
                            value={readerContentWidth}
                            onChange={handleReaderContentWidthChange}
                            className="mx-1"
                            title="调节阅读宽度"
                            ariaLabel="阅读宽度"
                          />
                        ) : null}
                        {isPageDetailView ? (
                          <>
                            {pageDetailBackButton}
                            {pageDockButton}
                            {isNovelReading ? (
                              <NovelReaderSettingsButton
                                theme={theme}
                                settings={novelReaderSettings}
                                onChange={handleNovelReaderSettingsChange}
                              />
                            ) : null}
                            {chapterToolbarNav}
                            {pageDetailModalSwitchButton}
                            {showPlaybackHistoryButton && activePluginMeta ? (
                              <PlaybackHistoryButton
                                plugin={activePluginMeta}
                                channelId={activeChannel}
                                onClick={() => setPlaybackHistoryOpen(true)}
                              />
                            ) : null}
                            {chaptersOpenButton}
                          </>
                        ) : (
                          <>

                        {pageDockButton}

                        {chapters.isActive && isNovelReading ? (
                          <NovelReaderSettingsButton
                            theme={theme}
                            settings={novelReaderSettings}
                            onChange={handleNovelReaderSettingsChange}
                          />
                        ) : null}
                        {chapterToolbarNav}
                        {chaptersOpenButton}

                        {isSplitBroadcastMode && activePlugin !== "all" ? (
                          <>
                            <GridColumnSwitcher
                              theme={theme}
                              label="卡片列"
                              value={gridColumnCount}
                              onChange={handleGridColumnCountChange}
                            />
                            <GridCoverAspectSwitcher
                              theme={theme}
                              value={gridCoverAspectRatio}
                              onChange={handleGridCoverAspectRatioChange}
                            />
                            <GridColumnSwitcher
                              theme={theme}
                              label="视频列"
                              value={videoWallColumnCount}
                              onChange={handleVideoWallColumnCountChange}
                            />
                          </>
                        ) : null}

                        {(isWaterfallPreviewMode || isGridPreviewMode || isSplitDetailMode) && activePlugin !== "all" ? (
                          <GridColumnSwitcher
                            theme={theme}
                            value={gridColumnCount}
                            onChange={handleGridColumnCountChange}
                          />
                        ) : null}

                        {(isGridPreviewMode || isSplitDetailMode) && activePlugin !== "all" ? (
                          <GridCoverAspectSwitcher
                            theme={theme}
                            value={gridCoverAspectRatio}
                            onChange={handleGridCoverAspectRatioChange}
                          />
                        ) : null}

                        {isGridPreviewMode && activePlugin !== "all" ? (
                          <GridDetailModeSwitcher
                            theme={theme}
                            value={gridDetailViewMode}
                            onChange={handleGridDetailViewModeChange}
                          />
                        ) : null}

                        {isVideoWallPreviewMode && activePlugin !== "all" ? (
                          <GridColumnSwitcher
                            theme={theme}
                            label="视频列"
                            value={videoWallColumnCount}
                            onChange={handleVideoWallColumnCountChange}
                          />
                        ) : null}

                        {isSocialFeedPreviewMode && activePlugin !== "all" ? (
                          <ComicPageWidthSlider
                            theme={theme}
                            value={socialFeedWidth}
                            onChange={handleSocialFeedWidthChange}
                            className="mx-1"
                            title="调节推文宽度"
                            ariaLabel="推文宽度"
                          />
                        ) : null}

                        <div className="relative flex items-center" ref={previewModeMenuRef}>
                          <button
                            type="button"
                            onClick={handlePreviewModePrimaryClick}
                            disabled={activePlugin === "all"}
                            className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all disabled:opacity-30 disabled:pointer-events-none ${
                              previewModeMenuOpen
                                ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200"
                                : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                            }`}
                            title="布局模式"
                            aria-expanded={previewModeMenuOpen}
                            aria-haspopup="menu"
                          >
                            <Icon name="layers" className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">
                              {previewModeLabel(
                                activePlugin === "all"
                                  ? "reader"
                                  : resolvePluginPreviewMode(activePluginMeta, pluginPreviewMode),
                              )}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewModeMenuOpen(open => !open)}
                            disabled={activePlugin === "all"}
                            className={`p-1 rounded-lg transition-all disabled:opacity-30 disabled:pointer-events-none ${
                              previewModeMenuOpen
                                ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200"
                                : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                            }`}
                            title="切换布局模式"
                            aria-label="切换布局模式"
                          >
                            <svg
                              viewBox="0 0 12 12"
                              className={`w-3 h-3 opacity-60 transition-transform ${previewModeMenuOpen ? "rotate-180" : ""}`}
                              aria-hidden="true"
                            >
                              <path
                                d="M3 4.5L6 7.5L9 4.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>

                          {previewModeMenuOpen ? (
                            <div
                              role="menu"
                              className={`absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-xl border shadow-lg ${
                                isDarkTheme(theme)
                                  ? "border-[var(--orbit-border-strong)] orbit-surface-elevated"
                                  : "border-neutral-200 bg-white"
                              }`}
                            >
                              <div className={`px-3 py-2 text-[11px] font-medium ${
                                isDarkTheme(theme) ? "text-neutral-400" : "text-neutral-500"
                              }`}>
                                布局模式
                              </div>
                              {previewModeOptionsForPlugin(activePluginMeta, showVideoWallPreviewOption).map(([mode, label, desc]) => {
                                const isActive = resolvePluginPreviewMode(activePluginMeta, pluginPreviewMode) === mode;
                                return (
                                  <button
                                    key={mode}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={isActive}
                                    onClick={() => handleSelectPreviewMode(mode)}
                                    className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                                      isActive
                                        ? isDarkTheme(theme)
                                          ? "bg-indigo-950/40 text-indigo-300"
                                          : "bg-indigo-50 text-indigo-700"
                                        : isDarkTheme(theme)
                                          ? "hover:bg-neutral-800/80 text-neutral-200"
                                          : "hover:bg-neutral-50 text-neutral-800"
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-medium">{label}</div>
                                      <div className={`text-[11px] ${
                                        isDarkTheme(theme) ? "text-neutral-500" : "text-neutral-400"
                                      }`}>
                                        {desc}
                                      </div>
                                    </div>
                                    {isActive ? (
                                      <Icon name="check" className="mt-0.5 w-3.5 h-3.5 shrink-0 opacity-80" />
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>

                        {showFocusSearchButton ? (
                          <button
                            type="button"
                            onClick={openFocusSearch}
                            className="p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                            title="搜索"
                          >
                            <Icon name="search" className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">搜索</span>
                          </button>
                        ) : null}

                        {isPluginFocusMode && activePluginMeta ? (
                          <BrowserSessionButton
                            plugin={activePluginMeta}
                            channelId={activeChannel}
                          />
                        ) : null}

                        {showFocusModeRefreshButton ? (
                          <button
                            type="button"
                            onClick={handleFeedRefresh}
                            disabled={feedListBusy}
                            className="p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="刷新"
                          >
                            <Icon name="refresh" className={`w-3.5 h-3.5 ${feedRefreshing ? "animate-spin" : ""}`} />
                            <span className="hidden sm:inline">刷新</span>
                          </button>
                        ) : null}

                        {showPlaybackHistoryButton && activePluginMeta ? (
                          <PlaybackHistoryButton
                            plugin={activePluginMeta}
                            channelId={activeChannel}
                            onClick={() => setPlaybackHistoryOpen(true)}
                          />
                        ) : null}

                        {!isPluginFocusMode && selectedItem ? (
                          <>
                            <button
                              onClick={() => handleIgnoreArticle(selectedItem.id)}
                              className="p-1.5 rounded-lg transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                              title="忽略此文章"
                            >
                              <Icon name="eye-off" className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleBookmarkToggle(selectedItem.id)}
                              className={`p-1.5 rounded-lg transition-all ${
                                selectedItem.isBookmarked
                                  ? "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
                                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                              }`}
                              title="加入收藏"
                            >
                              <Icon
                                name="bookmark"
                                className="w-3.5 h-3.5"
                                active={selectedItem.isBookmarked}
                              />
                            </button>
                          </>
                        ) : null}

                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {showFocusSearchInput ? (
                    <div className="mt-2">
                      <div className={`relative flex items-center rounded-xl p-1 transition-all ${
                        isDarkTheme(theme) ? "orbit-surface-elevated" : "bg-[#f0f4f9]"
                      }`}>
                        <div className="pl-3 pr-2 text-neutral-400">
                          {feedSearching ? (
                            <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
                          ) : (
                            <Icon name="search" className="w-4 h-4" />
                          )}
                        </div>
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitSearch();
                            }
                          }}
                          placeholder={
                            isActiveDynamicChannel
                              ? "输入关键词后按回车搜索"
                              : "搜索文章标题、摘要、标签…（回车搜索）"
                          }
                          className="w-full py-1.5 bg-transparent text-sm outline-none placeholder-neutral-400 dark:placeholder-neutral-500"
                        />
                        {searchQuery ? (
                          <button
                            type="button"
                            onClick={clearSearch}
                            className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full"
                          >
                            <Icon name="close" className="w-3.5 h-3.5 text-neutral-500" />
                          </button>
                        ) : !isActiveDynamicChannel ? (
                          <button
                            type="button"
                            onClick={() => setFocusSearchOpen(false)}
                            className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full"
                            title="收起搜索"
                          >
                            <Icon name="close" className="w-3.5 h-3.5 text-neutral-500" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {isPluginFocusMode
                    && !(isGridPageMode && gridPageDetailOpen)
                    && (
                      (showPluginChannelBar && !isSocialFeedPreviewMode)
                      || (isSocialFeedPreviewMode && activePluginChannels.length > 0)
                    ) ? (
                    <PluginChannelBar
                      activeChannel={activeChannel}
                      channels={activePluginChannels}
                      onChannelChange={selectChannel}
                      className="mt-2"
                      minChannels={isSocialFeedPreviewMode ? 1 : 2}
                    />
                  ) : null}
                </div>

                {isSplitBroadcastMode ? (
                  <div className="min-h-0 flex-1">
                    <SplitGridVideoView
                      theme={theme}
                      runtimeBase={runtimeBase}
                      pluginId={activePlugin}
                      articles={pluginFeedArticles}
                      gridColumnCount={gridColumnCount}
                      onGridColumnCountChange={handleGridColumnCountChange}
                      coverAspectRatio={gridCoverAspectRatio}
                      videoColumnCount={videoWallColumnCount}
                      splitRatio={splitPaneRatio}
                      onSplitRatioChange={handleSplitPaneRatioChange}
                      videoSessions={splitWallSessions}
                      loading={feedLoading && !isFavoritesChannelActive}
                      loadingMore={feedLoadingMore && !isFavoritesChannelActive}
                      searching={feedSearching && !isFavoritesChannelActive}
                      hasMore={!isFavoritesChannelActive && feedHasMore}
                      onLoadMore={() => {
                        void loadMore().catch(console.error);
                      }}
                      onItemSelect={openReaderDetailModal}
                      onExpandSession={handleVideoWallExpandSession}
                      onCloseSession={handleVideoWallCloseSession}
                      showFavorites={isPluginFavoritesEnabled}
                      favoritedArticleIds={favoritedArticleIds}
                      onToggleFavorite={handleTogglePluginFavorite}
                    />
                  </div>
                ) : isSplitDetailMode ? (
                  <div className="min-h-0 flex-1">
                    <SplitGridDetailView
                      theme={theme}
                      runtimeBase={runtimeBase}
                      articles={pluginFeedArticles}
                      selectedArticle={splitDetailArticle}
                      gridColumnCount={gridColumnCount}
                      onGridColumnCountChange={handleGridColumnCountChange}
                      coverAspectRatio={gridCoverAspectRatio}
                      splitRatio={splitPaneRatio}
                      onSplitRatioChange={handleSplitPaneRatioChange}
                      readerFontScale={readerFontScale}
                      comicPageWidth={comicPageWidth}
                      readerContentWidth={readerContentWidth}
                      novelReaderSettings={novelReaderSettings}
                      hasDetail={splitDetailHasDetail}
                      activeChannel={splitDetailActiveChannel}
                      pluginMeta={activePluginMeta}
                      channelCapabilities={channelCapabilities}
                      storedChannel={getStoredPluginChannel(activePlugin)}
                      experienceMode={experienceMode}
                      loading={feedLoading && !isFavoritesChannelActive}
                      loadingMore={feedLoadingMore && !isFavoritesChannelActive}
                      searching={feedSearching && !isFavoritesChannelActive}
                      hasMore={!isFavoritesChannelActive && feedHasMore}
                      onLoadMore={handleSplitDetailLoadMore}
                      onItemSelect={handleSplitDetailSelect}
                      showFavorites={isPluginFavoritesEnabled}
                      favoritedArticleIds={favoritedArticleIds}
                      onToggleFavorite={handleTogglePluginFavorite}
                    />
                  </div>
                ) : isVideoWallPreviewMode && activePlugin !== "all" ? (
                  <VideoWallFocusView
                    theme={theme}
                    runtimeBase={runtimeBase}
                    pluginId={activePlugin}
                    sessions={videoWallSessions}
                    columnCount={videoWallColumnCount}
                    onExpandSession={handleVideoWallExpandSession}
                    onCloseSession={handleVideoWallCloseSession}
                  />
                ) : isWaterfallPreviewMode && activePlugin !== "all" ? (
                  <ImageGalleryFocusView
                    key={`${activePlugin}-${activeChannel}-${gridColumnCount}`}
                    theme={theme}
                    runtimeBase={runtimeBase}
                    articles={pluginFeedArticles}
                    activeChannel={activeChannel}
                    pluginMeta={activePluginMeta}
                    columnCount={gridColumnCount}
                    loading={feedLoading}
                    loadingMore={feedLoadingMore}
                    searching={feedSearching}
                    hasMore={feedHasMore}
                    onLoadMore={() => {
                      void loadMore().catch(console.error);
                    }}
                    onImageOpen={(id) => {
                      const article = pluginFeedArticles.find(item => item.id === id)
                        ?? filteredArticles.find(item => item.id === id);
                      if (article) {
                        void markArticleRead(article);
                      }
                    }}
                    onItemDetailRequest={
                      !isActiveImageGalleryPlugin
                        ? openReaderDetailModal
                        : undefined
                    }
                    scrollRootRef={readerPanelRef}
                  />
                ) : isAudioFocusPreviewMode && activePlugin !== "all" ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <AudioFocusView
                      theme={theme}
                      runtimeBase={runtimeBase}
                      pluginId={activePlugin}
                      channelId={activeChannel}
                      pluginMeta={activePluginMeta}
                      articles={pluginFeedArticles}
                      loading={feedLoading && !isFavoritesChannelActive}
                      loadingMore={feedLoadingMore && !isFavoritesChannelActive}
                      searching={feedSearching && !isFavoritesChannelActive}
                      hasMore={!isFavoritesChannelActive && feedHasMore}
                      onLoadMore={() => {
                        void loadMore().catch(console.error);
                      }}
                      onTrackPlay={(article: Article) => {
                        void markArticleRead(article);
                      }}
                      showFavorites={isPluginFavoritesEnabled}
                      favoritedArticleIds={favoritedArticleIds}
                      onToggleFavorite={handleTogglePluginFavorite}
                    />
                  </div>
                ) : isSocialFeedPreviewMode && activePlugin !== "all" ? (
                  <SocialFeedFocusView
                    theme={theme}
                    runtimeBase={runtimeBase}
                    articles={isPluginFavoritesEnabled
                      ? pluginFeedArticles.map(item => ({
                          ...item,
                          isBookmarked: favoritedArticleIds.has(item.id),
                        }))
                      : pluginFeedArticles}
                    feedWidthPercent={socialFeedWidth}
                    loading={feedLoading && !isFavoritesChannelActive}
                    loadingMore={feedLoadingMore && !isFavoritesChannelActive}
                    searching={feedSearching && !isFavoritesChannelActive}
                    hasMore={!isFavoritesChannelActive && feedHasMore}
                    onLoadMore={() => {
                      void loadMore().catch(console.error);
                    }}
                    onItemSelect={handleSocialFeedItemSelect}
                    onBookmark={(article, event) => {
                      event.stopPropagation();
                      if (isPluginFavoritesEnabled) {
                        handleTogglePluginFavorite(article, event);
                      } else {
                        handleBookmarkToggle(article.id);
                      }
                    }}
                    onIgnore={(article, event) => {
                      event.stopPropagation();
                      handleIgnoreArticle(article.id);
                    }}
                    scrollRootRef={readerPanelRef}
                  />
                ) : isGridPreviewMode && activePlugin !== "all" && !gridPageDetailOpen ? (
                  <RatingFocusView
                    key={`${activePlugin}-${activeChannel}-${gridColumnCount}-${gridCoverAspectRatio}`}
                    theme={theme}
                    runtimeBase={runtimeBase}
                    articles={pluginFeedArticles}
                    columnCount={gridColumnCount}
                    coverAspectRatio={gridCoverAspectRatio}
                    loading={feedLoading && !isFavoritesChannelActive}
                    loadingMore={feedLoadingMore && !isFavoritesChannelActive}
                    searching={feedSearching && !isFavoritesChannelActive}
                    hasMore={!isFavoritesChannelActive && feedHasMore}
                    onLoadMore={() => {
                      void loadMore().catch(console.error);
                    }}
                    onItemSelect={handleGridItemSelect}
                    scrollRootRef={readerPanelRef}
                    showFavorites={isPluginFavoritesEnabled}
                    favoritedArticleIds={favoritedArticleIds}
                    onToggleFavorite={handleTogglePluginFavorite}
                  />
                ) : (selectedItem || chapters.isActive) ? (
                <div className="flex min-h-0 w-full flex-col">
                {showRatingHero && selectedItem ? (
                  <div className="shrink-0 w-full mb-4">
                    <ArticleRatingHero
                      article={selectedItem}
                      theme={theme}
                      runtimeBase={runtimeBase}
                      onCoverError={() => setCoverImageFailed(true)}
                    />
                  </div>
                ) : null}
                <div className="flex-1 min-h-0 w-full">
                {selectedItem ? (
                <div
                  className={`article-reader space-y-6${isComicReaderContent ? " article-reader--comic" : ""}${isMangaIntroPage ? " article-reader--manga-intro" : ""}${isNovelReading ? " article-reader--novel" : ""}${isNovelReading && isNovelBackgroundTuned(novelReaderSettings.background) ? " article-reader--novel-bleed" : ""}`}
                  data-novel-background={isNovelReading ? novelReaderSettings.background : undefined}
                  style={{
                    "--reader-scale": readerFontScale,
                    "--comic-page-width": comicPageWidthCssValue(comicPageWidth),
                    "--reader-content-width": readerContentWidthCssValue(readerContentWidth),
                    ...novelReaderStyle,
                  } as React.CSSProperties}
                >
                {aiSummary && (
                  <div className="relative p-5 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-100 dark:border-indigo-900/30 text-sm leading-relaxed text-indigo-900 dark:text-indigo-300">
                    <button 
                      onClick={() => setAiSummary(null)}
                      className="absolute top-3 right-3 p-1 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                    >
                      <Icon name="close" className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="sparkles" className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span className="font-bold">AI 速读概括</span>
                    </div>
                    <p className="whitespace-pre-line text-xs md:text-sm">{aiSummary}</p>
                  </div>
                )}

                {/* Article Header (Title, Subinfo) */}
                <div className="space-y-4">
                  {!showRatingHero && !isComicReaderContent && !isNovelReading ? (
                  <div className="flex items-start gap-3">
                    <h1 className="article-reader-title font-extrabold tracking-tight text-neutral-900 dark:text-white leading-tight flex-1 min-w-0">
                      {selectedItem.title}
                    </h1>
                  </div>
                  ) : null}

                  {/* Dynamic Interactive Media Section (Based on Resource Type) */}
                  {showArticleMedia && !showRatingHero ? (
                  <div className="w-full rounded-2xl overflow-hidden shadow-md bg-neutral-100 dark:bg-neutral-900">
                    
                    {/* Type 2: Video — YouTube embed or direct stream */}
                    {selectedItem.type === 'video' && (
                      <div className="relative aspect-video bg-neutral-950 flex flex-col items-center justify-center text-white">
                        {selectedYouTubeVideoId ? (
                          <YouTubeEmbed
                            sessionId={inlineSessionId}
                            runtimeBase={runtimeBase}
                            videoId={selectedYouTubeVideoId}
                            title={selectedItem.title}
                          />
                        ) : selectedItem.videoUrl ? (
                          <video
                            id="reader-video"
                            src={selectedItem.videoUrl}
                            className="w-full h-full object-cover"
                            controls
                          />
                        ) : null}
                        <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full text-xs flex items-center gap-1.5 backdrop-blur-md pointer-events-none">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                          <span>{selectedYouTubeVideoId ? "YouTube" : "视频流"}</span>
                        </div>
                      </div>
                    )}

                    {selectedAudioUrl ? (
                      <div className="p-4 md:p-6 bg-[var(--orbit-surface)]">
                        <ReaderAudioPlayer
                          sessionId={inlineSessionId ?? `inline-audio:${selectedItem.pluginId}:${selectedItem.id}`}
                          article={selectedItem}
                          audioUrl={selectedAudioUrl}
                          runtimeBase={runtimeBase}
                          playlist={selectedAudioPlaylist}
                          coverImage={selectedAudioCoverImage}
                        />
                      </div>
                    ) : null}

                    {/* Type 4: Multi-image gallery */}
                    {selectedItem.type === 'image' && selectedItem.galleryImages?.length ? (
                      <div className="relative bg-neutral-900 flex flex-col">
                        <div className="aspect-video w-full overflow-hidden flex items-center justify-center">
                          <ProxiedImage
                            runtimeBase={runtimeBase}
                            src={selectedItem.galleryImages[activeImageIndex]}
                            alt={`Gallery image ${activeImageIndex}`}
                            className="max-h-[400px] object-contain w-full transition-all duration-300"
                          />
                        </div>

                        {/* Gallery Thumbnails navigation bar */}
                        <div className="p-3 bg-black/60 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            {selectedItem.galleryImages.map((img, idx) => (
                              <button 
                                key={idx}
                                onClick={() => setActiveImageIndex(idx)}
                                className={`w-12 h-8 rounded-lg overflow-hidden border-2 transition-all ${
                                  activeImageIndex === idx ? 'border-indigo-500 scale-105' : 'border-transparent opacity-60'
                                }`}
                              >
                                <ProxiedImage runtimeBase={runtimeBase} src={img} className="w-full h-full object-cover" alt="" />
                              </button>
                            ))}
                          </div>

                          <div className="text-xs text-white/80">
                            第 {activeImageIndex + 1} 张 / 共 {selectedItem.galleryImages.length} 张
                          </div>
                        </div>
                      </div>
                    ) : null}

                  </div>
                  ) : null}

                </div>

                {/* Tags Section */}
                {!showRatingHero && !isComicReaderContent ? (
                <div className="flex flex-wrap gap-2">
                  {(selectedItem.tags ?? []).map((tag, idx) => (
                    <span 
                      key={idx} 
                      className="px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer transition-colors"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
                ) : null}

                {/* Content body */}
                {showContentLoadingPlaceholder ? (
                  <div className="mt-6 flex items-center gap-2 text-sm text-neutral-400">
                    <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
                    加载正文中…
                  </div>
                ) : comicChapterStreamActive ? (
                  <ComicChapterStream
                    slots={comicStream.slots}
                    streamContainerRef={comicStream.streamContainerRef}
                    theme={theme}
                    runtimeBase={runtimeBase}
                    reachedEnd={comicStream.reachedEnd}
                  />
                ) : canUseNovelChapterStream ? (
                  <>
                    <NovelChapterStream
                      slots={novelStream.slots}
                      streamContainerRef={novelStream.streamContainerRef}
                      theme={theme}
                      reachedEnd={novelStream.reachedEnd}
                    />
                    {chapterPager}
                  </>
                ) : comicPageUrls?.length ? (
                  <ComicPagesView
                    ref={articleContentRef}
                    pages={comicPageUrls}
                    runtimeBase={runtimeBase}
                    theme={theme}
                  />
                ) : selectedItemDisplayContent ? (
                  <>
                    <div
                      ref={articleContentRef}
                      data-theme={articleContentTheme(theme)}
                      className={`article-content mt-6${isMangaIntroPage ? " article-content--manga-intro" : ""}${isNovelReading && !isMangaIntroPage ? " article-content--novel" : ""}`}
                      dangerouslySetInnerHTML={{ __html: selectedItemDisplayContent }}
                    />
                    {introStartReading}
                    {chapterPager}
                    {selectedItem.sourceUrl ? (
                      <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                        <a
                          href={selectedItem.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:underline dark:text-indigo-400"
                        >
                          阅读原文 →
                        </a>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-6 border-t border-dashed dark:border-neutral-800 pt-6 space-y-4">
                    {selectedItem.summary?.trim() ? (
                      <p className="text-base text-neutral-600 dark:text-neutral-400 leading-relaxed italic">
                        “ {selectedItem.summary} ”
                      </p>
                    ) : null}
                    {selectedItem.sourceUrl ? (
                      <a
                        href={selectedItem.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-sm text-indigo-500 hover:underline"
                      >
                        阅读原文 →
                      </a>
                    ) : (
                      <p className="text-sm text-neutral-400">
                        （这是一个带有交互式卡片的媒体项目资源，详情请在上方播放器/视图组件中直接点击交互并体验。）
                      </p>
                    )}
                  </div>
                )}

                </div>
                ) : chapters.loading ? (
                  <p className="text-sm text-neutral-400 text-center py-12">正在加载目录…</p>
                ) : null}
                </div>

                <ChaptersDrawer
                  open={chaptersDrawerOpen}
                  theme={theme}
                  title={chapters.title || "选集"}
                  onClose={() => setChaptersDrawerOpen(false)}
                >
                  {chapters.isActive && chaptersParent ? (
                    <ChaptersList
                      theme={theme}
                      variant="sidebar"
                      title={chapters.title}
                      items={chapters.items}
                      loading={chapters.loading}
                      loadingMore={chapters.loadingMore}
                      refreshing={chapters.refreshing}
                      hasMore={chapters.hasMore}
                      canLoadMore={channelCapabilities.canLoadMoreChapters}
                      canRefresh={channelCapabilities.canRefreshChapters || channelCapabilities.hasChapters}
                      parentItem={chaptersParent}
                      activeItemId={activeChapterId}
                      itemLabel={channelCapabilities.chaptersItemLabel}
                      onSelect={chapter => {
                        setChaptersDrawerOpen(false);
                        setDetailResumeIntent(undefined);
                        detailResumeAppliedRef.current = true;
                        if (readerPanelRef.current) {
                          readerPanelRef.current.scrollTop = 0;
                        }
                        void chapters.selectChapter(chapter);
                      }}
                      onLoadMore={chapters.loadMore}
                      onRefresh={chapters.refresh}
                      onClearAndRefresh={chapters.clearAndRefresh}
                    />
                  ) : null}
                </ChaptersDrawer>
                </div>
                ) : null}
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-neutral-800 flex items-center justify-center mb-4">
                  <Icon name="sparkles" className="w-8 h-8 text-indigo-500" />
                </div>
                <h3 className="text-lg font-bold text-neutral-800 dark:text-white">请在列表中选择一篇文章开始阅读</h3>
                <p className="text-sm text-neutral-400 max-w-sm mt-2">支持文章、视频、播客有声书与图片，全平台自适应，尊享极简。 </p>
              </div>
            )}

            </div>
          </section>
            </>
          )}
        </main>

      </div>

      {splitDetailVideoArticle ? (
        <SessionVideoSurface
          key={splitDetailSessionId(splitDetailVideoArticle)}
          sessionId={splitDetailSessionId(splitDetailVideoArticle)}
          article={splitDetailVideoArticle}
          runtimeBase={runtimeBase}
          useWallMount={false}
        />
      ) : null}

      {readerSessions.filter(isDedicatedVideoReaderSession).map(session => (
        <SessionVideoSurface
          key={session.id}
          sessionId={session.id}
          article={session.article}
          runtimeBase={runtimeBase}
          useWallMount={sessionUsesWallMount(session, pluginPreviewMode)}
        />
      ))}

      {readerSessions.map(session => (
        <ArticleReaderModal
          key={session.id}
          sessionId={session.id}
          theme={theme}
          runtimeBase={runtimeBase}
          article={session.article}
          readerFontScale={readerFontScale}
          comicPageWidth={comicPageWidth}
          onComicPageWidthChange={handleComicPageWidthChange}
          readerContentWidth={readerContentWidth}
          onReaderContentWidthChange={handleReaderContentWidthChange}
          novelReaderSettings={novelReaderSettings}
          onNovelReaderSettingsChange={handleNovelReaderSettingsChange}
          hasDetail={session.hasDetail}
          activeChannel={session.activeChannel}
          pluginMeta={pluginById.get(session.article.pluginId)}
          channelCapabilities={channelCapabilities}
          storedChannel={getStoredPluginChannel(session.article.pluginId)}
          mode={session.mode}
          autoDockOnDismiss={session.autoDockOnDismiss}
          inVideoWall={sessionUsesWallMount(session, pluginPreviewMode)}
          onClose={() => closeReaderSession(session.id)}
          onDock={() => dockReaderSession(session.id)}
          onArticleChange={article => updateReaderSessionArticle(session.id, article)}
          resumeIntent={session.resumeIntent}
          onResumeApplied={() => clearReaderSessionResume(session.id)}
          pageDetailSwitchEnabled={
            isGridPreviewMode
            && session.mode === "expanded"
            && session.article.pluginId === activePlugin
          }
          onSwitchToPageDetail={payload => switchReaderToPageDetail(session.id, payload)}
          experienceMode={experienceMode}
        />
      ))}

      {activePluginMeta && showPlaybackHistoryButton ? (
        <PlaybackHistoryPanel
          open={playbackHistoryOpen}
          onClose={() => setPlaybackHistoryOpen(false)}
          plugin={activePluginMeta}
          channelId={activeChannel}
          channelCapabilities={channelCapabilities}
          runtimeBase={runtimeBase}
          theme={theme}
          onSelect={record => void handlePlaybackResume(record)}
        />
      ) : null}

      <ReaderDock
        theme={theme}
        runtimeBase={runtimeBase}
        sessions={
          isWallVideoActive
            ? readerSessions.filter(session => !isDedicatedVideoReaderSession(session))
            : readerSessions
        }
        onExpand={expandReaderSession}
        onClose={closeReaderSession}
        onCloseAll={closeDockedReaderSessions}
      />

      {previewLightbox}
      {ttsOverlays}

      {unlockModalOpen ? (
        <ExperienceModeUnlockModal
          theme={theme}
          onClose={closeUnlockModal}
          onUnlock={handleUnlock}
        />
      ) : null}

      <BrowserSessionHost />

    </div>
    </VideoSessionMountProvider>
  );
}
