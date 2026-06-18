import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import orbitLogo from "@/assets/logo.png";
import { Icon } from "@/components/Icon";
import { ImageGalleryFocusView } from "@/components/ImageGalleryFocusView";
import { RatingFocusView } from "@/components/RatingFocusView";
import { PluginAvatar } from "@/components/PluginAvatar";
import { PluginChannelBar } from "@/components/PluginChannelBar";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
import { ChaptersSidebar } from "@/components/ChaptersSidebar";
import { PluginManagerModal } from "@/components/PluginManagerModal";
import { useOrbitData } from "@/hooks/useOrbitData";
import { usePluginGroups } from "@/hooks/usePluginGroups";
import {
  dedupeCoverImageFromContent,
  mergeArticleListWithDetail,
  prepareArticleHtmlContent,
} from "@/lib/articleContent";
import {
  isBrowseDynamicChannel,
  isBrowseDynamicPlugin,
  isRatingPluginArticle,
  resolveBrowseDynamicChannel,
  resolveDefaultPluginChannel,
  shouldSkipFeedItemDetailFetch,
} from "@/lib/browseDynamicFeed";
import { isImageGalleryPlugin } from "@/lib/imagePlugin";
import { isVideoPluginChannel, resolveYouTubeVideoId } from "@/lib/youtube";
import { isChannelDynamic, isChannelEnabled } from "@/lib/channelStatus";
import { ProxiedImage } from "@/components/ProxiedImage";
import { highlightArticleCode } from "@/lib/highlightArticleCode";
import { fetchFeedItem } from "@/lib/feed";
import {
  channelHasChapters,
  fetchRuntimeChapters,
  runtimeOpenChapterDetail,
  runtimeOpenChapters,
  runtimeLoadMoreChapters,
  runtimeRefreshChapters,
  runtimeClearRefreshChapters,
  runtimeOpenDetail,
  shouldUseRuntimeV2,
} from "@/lib/runtimeV2";
import { bindArticleContentImages } from "@/lib/imageProxy";
import { waitForRuntimeReady } from "@/lib/runtime";
import {
  persistIgnoredArticleIds,
  readIgnoredArticleIds,
} from "@/lib/ignoredArticles";
import {
  getStoredPluginChannel,
  persistPluginChannel,
} from "@/lib/pluginChannelMemory";
import {
  getStoredPluginPreviewMode,
  persistPluginPreviewMode,
} from "@/lib/pluginPreviewMode";
import {
  READER_FONT_SCALE_DEFAULT,
  READER_FONT_SCALE_MAX,
  READER_FONT_SCALE_MIN,
  READER_FONT_SCALE_STEP,
  clampReaderFontScale,
  persistReaderFontScale,
  readStoredReaderFontScale,
} from "@/lib/readerFontScale";
import { useTitlebarDrag } from "@/hooks/useTitlebarDrag";
import { useTitlebarEnv } from "@/hooks/useTitlebarEnv";
import { useUiZoom } from "@/hooks/useUiZoom";
import type {
  ActiveTab,
  Article,
  CategoryFilter,
  InstallRSSPluginRequest,
  Plugin,
  ThemeMode,
} from "@/types";
import type { PluginPreviewMode } from "@/lib/pluginPreviewMode";

export default function App() {
  useUiZoom();
  useTitlebarEnv();
  const onTitlebarMouseDown = useTitlebarDrag();

  const [theme, _setTheme] = useState<ThemeMode>("light");
  // Default to collapsed so the (plugin) sidebar starts minimized.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [feedPanelVisible, setFeedPanelVisible] = useState(true);
  const [chaptersPanelVisible, setChaptersPanelVisible] = useState(true);
  const [activePlugin, setActivePlugin] = useState("all");
  const [activePluginGroupId, setActivePluginGroupId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState("all");
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");

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
    removePlugin: orbitRemovePlugin,
    movePlugin: orbitMovePlugin,
    reorderPlugins: orbitReorderPlugins,
    installOfficialPlugin: orbitInstallOfficialPlugin,
    updateOfficialPlugin: orbitUpdateOfficialPlugin,
    savePluginManifest: orbitSavePluginManifest,
    forceRefreshPlugin: orbitForceRefreshPlugin,
    refreshChannelFeed,
    clearRefreshChannelFeed,
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

  const sidebarPluginGroups = useMemo(
    () => groupedPluginsForSidebar(myPlugins),
    [groupedPluginsForSidebar, myPlugins],
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
  const [chaptersParent, setChaptersParent] = useState<Article | null>(null);
  const [chaptersItems, setChaptersItems] = useState<Article[]>([]);
  const [chaptersTitle, setChaptersTitle] = useState("");
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chaptersLoadingMore, setChaptersLoadingMore] = useState(false);
  const [chaptersRefreshing, setChaptersRefreshing] = useState(false);
  const [chaptersHasMore, setChaptersHasMore] = useState(false);
  const [activeChapterItem, setActiveChapterItem] = useState<Article | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const articleContentRef = useRef<HTMLDivElement>(null);
  const [runtimeBase, setRuntimeBase] = useState<string | null>(null);

  useEffect(() => {
    void waitForRuntimeReady().then(url => {
      setRuntimeBase(url.replace(/\/$/, ""));
    });
  }, []);
  const readerPanelRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("today");

  const [showPluginStore, setShowPluginStore] = useState(false);
  const [isSidebarRefreshing, setIsSidebarRefreshing] = useState(false);

  useEffect(() => {
    setChaptersParent(null);
    setChaptersItems([]);
    setChaptersTitle("");
    setChaptersHasMore(false);
    setActiveChapterItem(null);
  }, [activePlugin, activeChannel]);

  const [pluginPreviewMode, setPluginPreviewMode] = useState<PluginPreviewMode>("reader");
  const [previewModeModalOpen, setPreviewModeModalOpen] = useState(false);
  const [pendingPreviewMode, setPendingPreviewMode] = useState<PluginPreviewMode>("reader");
  const [savePreviewModeAsDefault, setSavePreviewModeAsDefault] = useState(true);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [readerFontScale, setReaderFontScale] = useState(READER_FONT_SCALE_DEFAULT);

  useEffect(() => {
    setReaderFontScale(readStoredReaderFontScale());
  }, []);

  const bumpReaderFontScale = useCallback((direction: -1 | 1) => {
    setReaderFontScale((prev) => {
      const next = clampReaderFontScale(prev + direction * READER_FONT_SCALE_STEP);
      persistReaderFontScale(next);
      return next;
    });
  }, []);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  // Audio Player State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(35);

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
    if (selectedItem.type === "text") {
      return Boolean(selectedItem.image?.trim()) && !coverImageFailed;
    }
    if (selectedItem.type === "video" || selectedItem.type === "audio") {
      return true;
    }
    if (selectedItem.type === "image") {
      if (selectedItem.galleryImages?.length) {
        return true;
      }
      return Boolean(selectedItem.image?.trim()) && !coverImageFailed;
    }
    return false;
  }, [selectedItem, coverImageFailed, pluginById]);

  const selectedYouTubeVideoId = useMemo(
    () => (selectedItem ? resolveYouTubeVideoId(selectedItem) : null),
    [selectedItem],
  );

  const selectedItemDisplayContent = useMemo(() => {
    if (!selectedItem?.content?.trim()) return "";
    let content = selectedItem.content;
    if (selectedItem.type === "text" && selectedItem.image) {
      content = dedupeCoverImageFromContent(selectedItem.image, content);
    }
    return prepareArticleHtmlContent(content, runtimeBase);
  }, [runtimeBase, selectedItem?.content, selectedItem?.image, selectedItem?.type]);

  useEffect(() => {
    highlightArticleCode(articleContentRef.current);
    bindArticleContentImages(articleContentRef.current, runtimeBase);
  }, [runtimeBase, selectedItemDisplayContent, theme]);

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

  const selectedPluginMeta = selectedItem ? pluginById.get(selectedItem.pluginId) : undefined;
  const isRatingCoverLayout = Boolean(
    selectedItem && isRatingPluginArticle(selectedItem, selectedPluginMeta),
  );

  const relatedRecentVideos = useMemo(() => {
    if (!selectedItem) return [];
    if (!isVideoPluginChannel(selectedPluginMeta, selectedItem)) return [];

    return articlesWithBookmarks
      .filter(
        item =>
          item.id !== selectedItem.id &&
          item.type === "video" &&
          item.pluginId === selectedItem.pluginId &&
          (!selectedItem.channelId ||
            !item.channelId ||
            item.channelId === selectedItem.channelId),
      )
      .slice(0, 5);
  }, [selectedItem, selectedPluginMeta, articlesWithBookmarks]);

  const activePluginChannels = useMemo(() => {
    if (activePlugin === "all") return [];
    return (pluginById.get(activePlugin)?.channels ?? []).filter(ch => isChannelEnabled(ch.status));
  }, [activePlugin, pluginById]);

  const activePluginMeta = useMemo(
    () => (activePlugin === "all" ? undefined : pluginById.get(activePlugin)),
    [activePlugin, pluginById],
  );

  const activeChannelMeta = useMemo(() => {
    if (activePlugin === "all" || activeChannel === "all") return undefined;
    return activePluginChannels.find(ch => ch.id === activeChannel);
  }, [activePlugin, activeChannel, activePluginChannels]);

  void activeChannelMeta;

  const isActiveDynamicChannel = channelCapabilities.canSearch;

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

  const showPluginChannelBar = activePluginChannels.length > 1;
  const showChaptersSidebar = chaptersParent != null;
  const isReaderPreviewMode = pluginPreviewMode === "reader";
  const isWaterfallPreviewMode = pluginPreviewMode === "waterfall";
  const isGridPreviewMode = pluginPreviewMode === "grid";
  const hideFeedPanel = !isReaderPreviewMode || !feedPanelVisible;
  const isPluginFocusMode = !isReaderPreviewMode && activePlugin !== "all";

  const showFeedChannelActions = activePlugin !== "all"
    && channelCapabilities.canRefresh
    && activeTab !== "bookmarks"
    && activeTab !== "trending";

  const feedListBusy = feedLoading || feedRefreshing;

  const handleFeedRefresh = () => {
    if (feedListBusy) return;
    setFeedRefreshing(true);
    void refreshChannelFeed()
      .catch(err => console.error("refresh channel feed failed", err))
      .finally(() => setFeedRefreshing(false));
  };

  const handleFeedClearAndRefresh = () => {
    if (feedListBusy) return;
    setFeedRefreshing(true);
    void clearRefreshChannelFeed()
      .catch(err => console.error("clear refresh channel feed failed", err))
      .finally(() => setFeedRefreshing(false));
  };

  // TODO: 暗色主题待完善后恢复切换入口
  // const toggleTheme = () => {
  //   setTheme(prev => prev === 'light' ? 'dark' : 'light');
  // };

  const handleSidebarRefresh = () => {
    if (isSidebarRefreshing) return;
    setIsSidebarRefreshing(true);
    void refreshFromCache()
      .finally(() => {
        setIsSidebarRefreshing(false);
      });
  };

  const handleItemSelect = useCallback((item: Article) => {
    void markArticleRead(item);
    setAiSummary(null);
    setIsPlayingAudio(false);
    setActiveImageIndex(0);
    setActiveChapterItem(null);

    const pluginMeta = pluginById.get(item.pluginId);
    const channelId = item.channelId ?? activeChannel;

    if (
      shouldUseRuntimeV2(item.pluginId, pluginMeta)
      && (channelCapabilities.hasChapters || channelHasChapters(pluginMeta, channelId))
      && channelId !== "all"
    ) {
      setChaptersParent(item);
      setChaptersItems([]);
      setChaptersTitle("");
      setChaptersHasMore(false);
      setChaptersLoading(true);
      setActiveChapterItem(null);
      setSelectedItem(null);
      const loadChapters = async () => {
        if (channelCapabilities.canRefreshChapters) {
          try {
            const cached = await fetchRuntimeChapters({
              pluginId: item.pluginId,
              channelId,
              parentId: item.id,
            });
            if ((cached.items ?? []).length > 0) {
              return cached;
            }
          } catch (err) {
            console.error("load cached chapters failed", err);
          }
        }
        return runtimeOpenChapters(item.pluginId, channelId, item.id);
      };
      void loadChapters()
        .then(result => {
          const items = result.items ?? [];
          setChaptersItems(items);
          setChaptersHasMore(Boolean(result.hasMore));
          setChaptersTitle(result.title ?? channelCapabilities.chaptersLabel ?? "目录");
          const first = items[0];
          if (!first) {
            setSelectedItem(null);
            return;
          }
          setActiveChapterItem(first);
          setSelectedItem(first);
          setContentLoading(true);
          return runtimeOpenChapterDetail(
            item.pluginId,
            channelId,
            item.id,
            first.id,
          );
        })
        .then(result => {
          if (result?.item) {
            setSelectedItem(result.item);
          }
        })
        .catch(err => console.error("open chapters failed", err))
        .finally(() => {
          setChaptersLoading(false);
          setContentLoading(false);
        });
      return;
    }

    setChaptersParent(null);
    setSelectedItem(prev =>
      prev?.id === item.id
        ? mergeArticleListWithDetail(item, prev)
        : item,
    );
  }, [
    activeChannel,
    channelCapabilities.chaptersLabel,
    channelCapabilities.canRefreshChapters,
    channelCapabilities.hasChapters,
    markArticleRead,
    pluginById,
  ]);

  useEffect(() => {
    if (chaptersParent) return;
    if (visibleArticles.length === 0) {
      setSelectedItem(null);
      return;
    }

    const prev = selectedItemRef.current;
    if (prev) {
      const listItem = visibleArticles.find(a => a.id === prev.id);
      if (listItem) {
        const merged = mergeArticleListWithDetail(listItem, prev);
        if (merged !== prev) {
          setSelectedItem(merged);
        }
        return;
      }
    }

    const first = visibleArticles[0];
    if (first) {
      handleItemSelect(first);
    }
  }, [visibleArticles, chaptersParent, handleItemSelect]);

  const handleChapterSelect = (chapter: Article) => {
    if (!chaptersParent) return;
    const channelId = chaptersParent.channelId ?? activeChannel;
    setActiveChapterItem(chapter);
    setSelectedItem(chapter);
    setContentLoading(true);
    void runtimeOpenChapterDetail(
      chaptersParent.pluginId,
      channelId,
      chaptersParent.id,
      chapter.id,
    )
      .then(result => {
        if (result.item) {
          setSelectedItem(result.item);
        }
      })
      .catch(err => console.error("open chapter detail failed", err))
      .finally(() => setContentLoading(false));
  };

  const handleChaptersLoadMore = () => {
    if (!chaptersParent || chaptersLoadingMore || !chaptersHasMore) return;
    const channelId = chaptersParent.channelId ?? activeChannel;
    setChaptersLoadingMore(true);
    void runtimeLoadMoreChapters(chaptersParent.pluginId, channelId, chaptersParent.id)
      .then(result => {
        const items = result.items ?? [];
        setChaptersItems(prev => [...prev, ...items]);
        setChaptersHasMore(Boolean(result.hasMore));
        if (result.title) {
          setChaptersTitle(result.title);
        }
      })
      .catch(err => console.error("load more chapters failed", err))
      .finally(() => setChaptersLoadingMore(false));
  };

  const applyChaptersRefreshResult = (result: { items?: Article[]; hasMore?: boolean; title?: string }) => {
    const items = result.items ?? [];
    setChaptersItems(items);
    setChaptersHasMore(Boolean(result.hasMore));
    if (result.title) {
      setChaptersTitle(result.title);
    }
    const first = items[0];
    if (!first) {
      setActiveChapterItem(null);
      setSelectedItem(null);
      return;
    }
    setActiveChapterItem(first);
    setSelectedItem(first);
    setContentLoading(true);
    const channelId = chaptersParent?.channelId ?? activeChannel;
    if (!chaptersParent) return;
    void runtimeOpenChapterDetail(
      chaptersParent.pluginId,
      channelId,
      chaptersParent.id,
      first.id,
    )
      .then(detail => {
        if (detail.item) {
          setSelectedItem(detail.item);
        }
      })
      .catch(err => console.error("open chapter detail failed", err))
      .finally(() => setContentLoading(false));
  };

  const handleChaptersRefresh = () => {
    if (!chaptersParent || chaptersRefreshing) return;
    const channelId = chaptersParent.channelId ?? activeChannel;
    setChaptersRefreshing(true);
    void runtimeRefreshChapters(chaptersParent.pluginId, channelId, chaptersParent.id)
      .then(applyChaptersRefreshResult)
      .catch(err => console.error("refresh chapters failed", err))
      .finally(() => setChaptersRefreshing(false));
  };

  const handleChaptersClearAndRefresh = () => {
    if (!chaptersParent || chaptersRefreshing) return;
    const channelId = chaptersParent.channelId ?? activeChannel;
    setChaptersRefreshing(true);
    void runtimeClearRefreshChapters(chaptersParent.pluginId, channelId, chaptersParent.id)
      .then(applyChaptersRefreshResult)
      .catch(err => console.error("clear refresh chapters failed", err))
      .finally(() => setChaptersRefreshing(false));
  };

  useEffect(() => {
    if (readerPanelRef.current) {
      readerPanelRef.current.scrollTop = 0;
    }
  }, [selectedItem?.id]);

  useEffect(() => {
    const itemId = selectedItem?.id;
    if (!itemId) {
      setContentLoading(false);
      return;
    }

    const pluginMeta = selectedItem
      ? pluginById.get(selectedItem.pluginId)
      : undefined;
    if (shouldSkipFeedItemDetailFetch(selectedItem, pluginMeta, channelCapabilities.hasDetail)) {
      setContentLoading(false);
      return;
    }

    const channelId = selectedItem.channelId ?? activeChannel;
    if (
      shouldUseRuntimeV2(selectedItem.pluginId, pluginMeta)
      && channelId !== "all"
      && !chaptersParent
      && channelCapabilities.hasDetail
    ) {
      let cancelled = false;
      setContentLoading(true);
      void runtimeOpenDetail(selectedItem.pluginId, channelId, itemId)
        .then(result => {
          if (cancelled || !result.item) return;
          setSelectedItem(prev =>
            prev?.id === itemId ? { ...prev, ...result.item } : prev,
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

    if (chaptersParent && activeChapterItem) {
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
          prev?.id === itemId ? { ...prev, ...detail } : prev,
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
  }, [selectedItem?.id, pluginById, activeChannel, channelCapabilities.hasDetail, chaptersParent, activeChapterItem]);

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
    [activePlugin, pluginById],
  );

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
    setActivePlugin(pluginId);
    if (pluginId === "all") {
      setActiveChannel("all");
      if (groupId) {
        setActivePluginGroupId(groupId);
      }
      if (isSwitchingPlugin) {
        setPluginPreviewMode("reader");
      }
      return;
    }
    setActiveChannel(resolvePluginChannel(pluginId));
    setActivePluginGroupId(groupId ?? getPluginGroupId(pluginId));
    setShowPluginStore(false);
    if (isSwitchingPlugin) {
      const saved = getStoredPluginPreviewMode(pluginId);
      setPluginPreviewMode(saved ?? "reader");
    }
  };

  useEffect(() => {
    if (activePlugin === "all") {
      setPluginPreviewMode("reader");
      return;
    }
    const saved = getStoredPluginPreviewMode(activePlugin);
    setPluginPreviewMode(saved ?? "reader");
  }, [activePlugin]);

  const handleOpenPreviewModeModal = useCallback(() => {
    if (activePlugin === "all") return;
    setPendingPreviewMode(pluginPreviewMode);
    setSavePreviewModeAsDefault(true);
    setPreviewModeModalOpen(true);
  }, [activePlugin, pluginPreviewMode]);

  const handleApplyPreviewMode = useCallback(() => {
    if (activePlugin === "all") return;
    setPluginPreviewMode(pendingPreviewMode);
    if (savePreviewModeAsDefault) {
      persistPluginPreviewMode(activePlugin, pendingPreviewMode);
    }
    setPreviewModeModalOpen(false);
  }, [activePlugin, pendingPreviewMode, savePreviewModeAsDefault]);

  const clearGroupFeedScope = () => {
    setActivePluginGroupId(null);
  };

  return (
    <div className={`h-screen flex flex-col font-sans transition-colors duration-300 ${theme === 'dark' ? 'bg-[#121314] text-[#e3e3e3]' : 'bg-[#f8f9fa] text-[#1f1f1f]'}`}>
      
      {}
      <header
        data-tauri-drag-region
        onMouseDown={onTitlebarMouseDown}
        className={`app-titlebar app-titlebar-drag shrink-0 z-40 flex h-12 items-center justify-between border-b px-4 transition-colors duration-300 ${theme === "dark" ? "bg-[#1c1d1f] border-neutral-800" : "bg-white border-neutral-100"}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 select-none pointer-events-none">
          <img
            src={orbitLogo}
            alt=""
            className="h-7 w-7 shrink-0 object-contain"
            draggable={false}
          />
          <span
            className={`text-sm font-bold tracking-tight truncate ${
              theme === "dark" ? "text-white" : "text-black"
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

          {showChaptersSidebar ? (
            <button
              type="button"
              onClick={() => setChaptersPanelVisible(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                chaptersPanelVisible
                  ? "bg-transparent border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  : "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-400"
              }`}
              title={chaptersPanelVisible ? "隐藏右侧章节目录" : "显示右侧章节目录"}
            >
              <Icon name={chaptersPanelVisible ? "collapse" : "expand"} className="w-3.5 h-3.5 scale-x-[-1]" />
              <span className="hidden sm:inline">
                {chaptersPanelVisible ? "隐藏右侧目录" : "显示右侧目录"}
              </span>
            </button>
          ) : null}

          {/* Theme Switcher — 暂时隐藏，暗色主题待完善后恢复 */}

          {/* Plugin Install Quick Button */}
          <button 
            onClick={() => setShowPluginStore(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            <Icon name="puzzle" className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">安装/管理插件</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden relative">
        
        {}
        <aside className={`h-full flex flex-col justify-between border-r transition-all duration-300 ${
          theme === 'dark' ? 'bg-[#1c1d1f] border-neutral-800' : 'bg-white border-neutral-100'
        } ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          
          <div className="shrink-0 pt-3">
            {/* Sidebar collapse toggle */}
            <div
              className={`mb-1 pb-1 border-b ${theme === "dark" ? "border-neutral-800" : "border-neutral-100"} ${isSidebarCollapsed ? "px-0" : "px-3"}`}
            >
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className={`w-full flex items-center py-1 rounded-lg text-xs transition-all duration-200 ${
                  isSidebarCollapsed ? "justify-center px-0" : "gap-2 px-2"
                } ${
                  theme === "dark"
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
                  return sidebarPluginGroups
                    .filter(({ group }) => !isGroupCollapsed(group.id))
                    .flatMap(({ plugins }) => plugins.map(renderPluginButton));
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
          <div className={`border-t dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/20 ${isSidebarCollapsed ? "p-2" : "p-3"}`}>
            <button 
              onClick={() => setShowPluginStore(true)}
              className={`w-full flex items-center justify-center rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-semibold transition-all ${
                isSidebarCollapsed ? "p-2" : "gap-2 py-2 px-3"
              }`}
            >
              <Icon name="puzzle" className="w-4 h-4" />
              {!isSidebarCollapsed && <span>添加/自定新插件</span>}
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-row h-full overflow-hidden transition-all duration-300">
          {showPluginStore ? (
            <PluginManagerModal
              theme={theme}
              myPlugins={myPlugins}
              pluginGroups={pluginGroups}
              groupedPluginsForManage={managePluginGroups}
              getPluginGroupId={getPluginGroupId}
              onClose={() => setShowPluginStore(false)}
              onInstall={handleInstallPlugin}
              onUpdate={handleUpdatePlugin}
              onUninstall={handleUninstallPlugin}
              onToggleActive={handleTogglePluginActive}
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
            />
          ) : (
            <>
          {}
          <section className={`w-full md:w-80 lg:w-96 h-full flex flex-col border-r border-l transition-all duration-300 ${
            theme === 'dark' ? 'bg-[#121314] border-neutral-800' : 'bg-white border-neutral-100'
          } ${hideFeedPanel ? 'hidden' : 'flex'}`}>
            
            {/* Search Column Container */}
            <div className="p-4 border-b dark:border-neutral-800 space-y-3">
              {!isBrowseDynamicPluginActive && (
                <div className={`relative flex items-center rounded-xl p-1 transition-all ${
                  theme === 'dark' ? 'bg-[#1c1d1f]' : 'bg-[#f0f4f9]'
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
                            ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm"
                            : "bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))
                    : (
                      <PluginChannelBar
                        activeChannel={activeChannel}
                        channels={activePluginChannels}
                        onChannelChange={selectChannel}
                      />
                    )}
                </div>
              )}
            </div>

            {/* Scrollable list of feeds */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
              <div className="flex items-center justify-between text-xs text-neutral-400 mb-2 gap-2">
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
                      <button
                        type="button"
                        onClick={handleFeedClearAndRefresh}
                        disabled={feedListBusy}
                        title="清空并刷新"
                        className="px-2 py-0.5 rounded-lg text-[11px] font-medium text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                      >
                        清空
                      </button>
                    </div>
                  ) : null}
                  <span>
                    {feedListBusy
                      ? "加载中…"
                      : isBrowseDynamicPluginActive
                        ? `共 ${feedTotal || filteredArticles.length} ${isImageGalleryPlugin(activePluginMeta) ? "张" : "篇"}`
                        : isActiveDynamicChannel
                          ? submittedSearch
                            ? `共 ${feedTotal} 条结果`
                            : "实时搜索"
                          : `共 ${submittedSearch ? feedTotal : filteredArticles.length} 篇`}
                  </span>
                </div>
              </div>

              {feedLoading ? (
                <div className="text-center py-12">
                  <p className="text-sm text-neutral-400">正在拉取 RSS 订阅…</p>
                </div>
              ) : feedError ? (
                <div className="text-center py-12 px-4">
                  <p className="text-sm text-rose-500">Feed 加载失败：{feedError}</p>
                  <p className="text-xs text-neutral-400 mt-2">请确认 Go runtime 已启动（make dev-go）</p>
                </div>
              ) : filteredArticles.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 rounded-full bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3">
                    <Icon name="search" className="w-6 h-6 text-neutral-400" />
                  </div>
                  <p className="text-sm text-neutral-400">
                    {feedSearching
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
                  {filteredArticles.map((item) => {
                    const isSelected =
                      (selectedItem && selectedItem.id === item.id)
                      || (chaptersParent != null && chaptersParent.id === item.id);
                    const isUnread = !item.isRead;
                    const pluginMeta = pluginById.get(item.pluginId);
                    return (
                      <div 
                        key={item.id}
                        onClick={() => handleItemSelect(item)}
                        className={`group relative p-3.5 rounded-2xl cursor-pointer transition-all duration-300 border-[0.5px] ${
                          isSelected 
                            ? 'bg-[#e9eef6] dark:bg-neutral-800 border-indigo-300 dark:border-neutral-600 shadow-sm' 
                            : 'bg-white hover:bg-[#f0f4f9] dark:bg-neutral-900 dark:hover:bg-neutral-800/40 border-neutral-200 dark:border-neutral-700'
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
                              <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">{item.pluginName}</span>
                              <span className="text-[10px] text-neutral-300">•</span>
                              <div className="text-neutral-400 group-hover:text-indigo-600 transition-colors">
                                <Icon name={item.type} className="w-3 h-3" />
                              </div>
                            </div>

                            <h4 className={`text-sm font-semibold leading-snug line-clamp-2 transition-colors ${
                              isSelected ? 'text-indigo-700 dark:text-indigo-400' : 'text-neutral-800 dark:text-neutral-200'
                            }`}>
                              {item.title}
                            </h4>
                            {item.summary && (
                              <p className="text-xs text-neutral-400 dark:text-neutral-500 line-clamp-2 mt-0.5 leading-snug">
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
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-dashed border-neutral-100 dark:border-neutral-800/80 text-[10px] text-neutral-400">
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
                              className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full"
                              title="忽略此文章"
                            >
                              <Icon name="eye-off" className="w-3 h-3 text-neutral-400" />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBookmarkToggle(item.id);
                              }}
                              className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full"
                              title="收藏"
                            >
                              <Icon name="bookmark" className="w-3 h-3 text-neutral-400" active={item.isBookmarked} />
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                  {(feedHasMore || (channelCapabilities.canLoadMore && filteredArticles.length > 0)) && (
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
            theme === 'dark' ? 'bg-[#121314]' : 'bg-[#fafafa]'
          }`}
          >
            <div
              ref={readerPanelRef}
              className={`flex-1 h-full min-w-0 overflow-y-auto ${
                theme === "dark" ? "bg-[#121314]" : "bg-[#fafafa]"
              }`}
            >
            
            {isPluginFocusMode || selectedItem ? (
              <div className={`${isPluginFocusMode ? "w-[80%]" : "max-w-3xl"} mx-auto px-6 pb-8 md:pb-10`}>
                {/* Reader toolbar — sticky near top */}
                <div
                  className={`sticky top-0 z-10 -mx-6 px-6 pt-2 pb-2 ${theme === "dark" ? "bg-[#121314]" : "bg-[#fafafa]"}`}
                >
                  <div
                    className={`rounded-xl border transition-all duration-200 ${
                      theme === "dark"
                        ? "bg-[#1c1d1f] border-neutral-800"
                        : "bg-white border-neutral-100"
                    } shadow-sm`}
                  >
                    <div className="flex items-center gap-2 p-2.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400 px-2 py-1 rounded-lg shrink-0 inline-flex items-center gap-1.5">
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
                        </span>
                        {!isPluginFocusMode && selectedItem ? (
                          <span className="text-xs text-neutral-400 truncate">
                            由 {selectedItem.author} 撰写
                          </span>
                        ) : null}
                        {isWaterfallPreviewMode && activePlugin !== "all" ? (
                          <span className="text-xs text-neutral-400 truncate">
                            图片观赏 · 共 {filteredArticles.length} 张
                          </span>
                        ) : null}
                        {isGridPreviewMode && activePlugin !== "all" ? (
                          <span className="text-xs text-neutral-400 truncate">
                            栅格预览 · 共 {filteredArticles.filter(item => item.pluginId === activePlugin).length} 条
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-end gap-1 shrink-0 ml-auto">
                        {!isPluginFocusMode ? (
                          <div className="flex items-center gap-0.5 mr-0.5">
                            <button
                              type="button"
                              onClick={() => bumpReaderFontScale(-1)}
                              disabled={readerFontScale <= READER_FONT_SCALE_MIN}
                              className="w-7 h-7 rounded-lg text-sm font-medium flex items-center justify-center transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 disabled:opacity-30 disabled:pointer-events-none"
                              title="减小字号"
                              aria-label="减小字号"
                            >
                              −
                            </button>
                            <button
                              type="button"
                              onClick={() => bumpReaderFontScale(1)}
                              disabled={readerFontScale >= READER_FONT_SCALE_MAX}
                              className="w-7 h-7 rounded-lg text-sm font-medium flex items-center justify-center transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 disabled:opacity-30 disabled:pointer-events-none"
                              title="增大字号"
                              aria-label="增大字号"
                            >
                              +
                            </button>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => {
                            if (hideFeedPanel) {
                              setPluginPreviewMode("reader");
                              setFeedPanelVisible(true);
                              return;
                            }
                            setFeedPanelVisible(false);
                          }}
                          disabled={activePlugin === "all"}
                          className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all disabled:opacity-30 disabled:pointer-events-none ${
                            !hideFeedPanel
                              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                              : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                          }`}
                          title={!hideFeedPanel ? "专注模式" : "退出专注模式"}
                        >
                          <Icon name="focus" className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">
                            {!hideFeedPanel ? "专注模式" : "退出专注"}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={handleOpenPreviewModeModal}
                          disabled={activePlugin === "all"}
                          className="p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 disabled:opacity-30 disabled:pointer-events-none"
                          title="预览模式"
                        >
                          <Icon name="layers" className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">
                            预览模式
                          </span>
                        </button>

                        {!isPluginFocusMode && selectedItem?.sourceUrl ? (
                          <a
                            href={selectedItem.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 text-indigo-500 dark:text-indigo-400"
                            title="阅读原文"
                          >
                            <Icon name="share" className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">阅读原文</span>
                          </a>
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
                      </div>
                    </div>
                  </div>

                  {isPluginFocusMode && showPluginChannelBar ? (
                    <PluginChannelBar
                      activeChannel={activeChannel}
                      channels={activePluginChannels}
                      onChannelChange={selectChannel}
                      className="mt-2"
                    />
                  ) : null}
                </div>

                {previewModeModalOpen ? (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
                    <div
                      className={`w-full max-w-md rounded-2xl border p-4 shadow-xl ${
                        theme === "dark" ? "bg-[#1c1d1f] border-neutral-800" : "bg-white border-neutral-200"
                      }`}
                    >
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold">选择预览模式</h3>
                        <p className="mt-1 text-xs text-neutral-500">
                          切换当前插件展示方式，可选是否保存为默认。
                        </p>
                      </div>
                      <div className="space-y-2">
                        {([
                          ["reader", "阅读模式", "文章阅读布局"] as const,
                          ["waterfall", "瀑布流", "图片优先布局"] as const,
                          ["grid", "栅格", "卡片评分布局"] as const,
                        ]).map(([mode, label, desc]) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setPendingPreviewMode(mode)}
                            className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                              pendingPreviewMode === mode
                                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                                : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/50"
                            }`}
                          >
                            <div className="text-sm font-medium">{label}</div>
                            <div className="text-xs text-neutral-500">{desc}</div>
                          </button>
                        ))}
                      </div>
                      <label className="mt-3 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                        <input
                          type="checkbox"
                          checked={savePreviewModeAsDefault}
                          onChange={(e) => setSavePreviewModeAsDefault(e.target.checked)}
                        />
                        保存预览模式（下次切换回该插件时默认使用）
                      </label>
                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewModeModalOpen(false)}
                          className="rounded-lg px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyPreviewMode}
                          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-white dark:text-neutral-900"
                        >
                          应用
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isWaterfallPreviewMode && activePlugin !== "all" ? (
                  <ImageGalleryFocusView
                    key={`${activePlugin}-${activeChannel}`}
                    theme={theme}
                    runtimeBase={runtimeBase}
                    articles={filteredArticles.filter(item => item.pluginId === activePlugin)}
                    loading={feedLoading}
                    loadingMore={feedLoadingMore}
                    hasMore={feedHasMore}
                    onLoadMore={() => {
                      void loadMore().catch(console.error);
                    }}
                    onImageOpen={(id) => {
                      const article = filteredArticles.find(item => item.id === id);
                      if (article) {
                        void markArticleRead(article);
                      }
                    }}
                    scrollRootRef={readerPanelRef}
                  />
                ) : isGridPreviewMode && activePlugin !== "all" ? (
                  <RatingFocusView
                    key={`${activePlugin}-${activeChannel}`}
                    theme={theme}
                    runtimeBase={runtimeBase}
                    articles={filteredArticles.filter(item => item.pluginId === activePlugin)}
                    loading={feedLoading}
                    loadingMore={feedLoadingMore}
                    hasMore={feedHasMore}
                    onLoadMore={() => {
                      void loadMore().catch(console.error);
                    }}
                    onItemSelect={(item) => {
                      void markArticleRead(item);
                      setSelectedItem(item);
                      setPluginPreviewMode("reader");
                    }}
                    scrollRootRef={readerPanelRef}
                  />
                ) : selectedItem ? (
                <div
                  className="article-reader space-y-6"
                  style={{ "--reader-scale": readerFontScale } as React.CSSProperties}
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
                  <h1 className="article-reader-title font-extrabold tracking-tight text-neutral-900 dark:text-white leading-tight">
                    {selectedItem.title}
                  </h1>

                  {/* Dynamic Interactive Media Section (Based on Resource Type) */}
                  {showArticleMedia && isRatingCoverLayout && selectedItem.type === "text" && selectedItem.image?.trim() ? (
                    <ProxiedImage
                      runtimeBase={runtimeBase}
                      src={selectedItem.image}
                      alt="Article Cover"
                      className="h-[380px] w-auto max-w-full object-contain mx-auto block"
                      onError={() => setCoverImageFailed(true)}
                    />
                  ) : showArticleMedia
                    && selectedItem.type === "image"
                    && selectedItem.image?.trim()
                    && !selectedItem.galleryImages?.length ? (
                    <ProxiedImage
                      runtimeBase={runtimeBase}
                      src={selectedItem.image}
                      alt={selectedItem.title}
                      onError={() => setCoverImageFailed(true)}
                    />
                  ) : showArticleMedia ? (
                  <div className="w-full rounded-2xl overflow-hidden shadow-md bg-neutral-100 dark:bg-neutral-900">
                    
                    {/* Type 1: Standard Article Main Image */}
                    {selectedItem.type === 'text' && selectedItem.image?.trim() && (
                      <ProxiedImage
                        runtimeBase={runtimeBase}
                        src={selectedItem.image}
                        alt="Article Cover"
                        className="w-auto h-auto max-w-full mx-auto block"
                        onError={() => setCoverImageFailed(true)}
                      />
                    )}

                    {/* Type 2: Video — YouTube embed or direct stream */}
                    {selectedItem.type === 'video' && (
                      <div className="relative aspect-video bg-neutral-950 flex flex-col items-center justify-center text-white">
                        {selectedYouTubeVideoId ? (
                          <YouTubeEmbed
                            videoId={selectedYouTubeVideoId}
                            title={selectedItem.title}
                          />
                        ) : selectedItem.videoUrl ? (
                          <video
                            id="reader-video"
                            src={selectedItem.videoUrl}
                            className="w-full h-full object-cover"
                            controls
                            poster={selectedItem.image}
                          />
                        ) : selectedItem.image ? (
                          <ProxiedImage
                            runtimeBase={runtimeBase}
                            src={selectedItem.image}
                            alt={selectedItem.title}
                            className="w-full h-full object-cover opacity-80"
                          />
                        ) : null}
                        <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full text-xs flex items-center gap-1.5 backdrop-blur-md pointer-events-none">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                          <span>{selectedYouTubeVideoId ? "YouTube" : "视频流"}</span>
                        </div>
                      </div>
                    )}

                    {/* Type 3: Interactive Podcast/Audio Player Deck */}
                    {selectedItem.type === 'audio' && (
                      <div className="p-6 md:p-8 bg-gradient-to-br from-neutral-900 to-neutral-800 text-white space-y-6">
                        <div className="flex flex-col sm:flex-row items-center gap-6">
                          {/* Rotating Album Art */}
                          <div className={`w-28 h-28 rounded-full overflow-hidden border-4 border-neutral-700 flex-shrink-0 shadow-lg relative ${
                            isPlayingAudio ? 'animate-spin' : ''
                          }`} style={{ animationDuration: '15s' }}>
                            <ProxiedImage runtimeBase={runtimeBase} src={selectedItem.image ?? ""} alt="Podcast Cover" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-neutral-900 border border-neutral-700"></div>
                          </div>
                          
                          <div className="flex-1 text-center sm:text-left space-y-2">
                            <span className="text-xs uppercase tracking-wider text-emerald-400 font-bold">Spotify Podcaster</span>
                            <h3 className="text-lg font-bold line-clamp-2">{selectedItem.title}</h3>
                            <p className="text-xs text-neutral-400">正在播放访谈：Sam Altman Special</p>
                          </div>
                        </div>

                        {/* Custom Player Controls */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-xs text-neutral-400">
                            <span>05:12</span>
                            <span>{selectedItem.audioDuration}</span>
                          </div>
                          
                          {/* Audio Progress Bar */}
                          <div 
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const clickX = e.clientX - rect.left;
                              const width = rect.width;
                              setAudioProgress(Math.floor((clickX / width) * 100));
                            }}
                            className="h-1.5 bg-neutral-700 rounded-full cursor-pointer relative"
                          >
                            <div 
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${audioProgress}%` }}
                            ></div>
                            <div 
                              className="absolute w-3.5 h-3.5 rounded-full bg-white shadow top-1/2 -translate-y-1/2 transition-all cursor-grab"
                              style={{ left: `calc(${audioProgress}% - 7px)` }}
                            ></div>
                          </div>

                          {/* Control deck */}
                          <div className="flex items-center justify-center gap-6 pt-2">
                            <button className="text-neutral-400 hover:text-white">
                              <span className="text-lg">⏮</span>
                            </button>
                            <button 
                              onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                              className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center text-black font-bold transition-all transform hover:scale-105"
                            >
                              <Icon name={isPlayingAudio ? "pause" : "play"} className="w-6 h-6 text-black" />
                            </button>
                            <button className="text-neutral-400 hover:text-white">
                              <span className="text-lg">⏭</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

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

                {/* Content body */}
                {contentLoading ? (
                  <div className="mt-6 flex items-center gap-2 text-sm text-neutral-400">
                    <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
                    加载正文中…
                  </div>
                ) : selectedItemDisplayContent ? (
                  <>
                    <div
                      ref={articleContentRef}
                      data-theme={theme}
                      className="article-content mt-6"
                      dangerouslySetInnerHTML={{ __html: selectedItemDisplayContent }}
                    />
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

                {relatedRecentVideos.length > 0 && (
                  <section className="mt-10 pt-8 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
                        更多视频
                      </h2>
                      <span className="text-[11px] text-neutral-400">
                        最近 {relatedRecentVideos.length} 条
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      {relatedRecentVideos.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleItemSelect(item)}
                          className={`w-full flex gap-3 p-2.5 rounded-xl text-left transition-all border ${
                            theme === "dark"
                              ? "border-neutral-800 hover:bg-neutral-900"
                              : "border-neutral-100 hover:bg-white hover:shadow-sm"
                          }`}
                        >
                          <div className="relative w-28 sm:w-32 aspect-video rounded-lg overflow-hidden shrink-0 bg-neutral-100 dark:bg-neutral-800">
                            {item.image?.trim() ? (
                              <ProxiedImage
                                runtimeBase={runtimeBase}
                                src={item.image}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                <Icon name="video" className="w-5 h-5" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                              <Icon name="play" className="w-5 h-5 text-white drop-shadow" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 py-0.5">
                            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 line-clamp-2 leading-snug">
                              {item.title}
                            </h3>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-400">
                              <span>{item.author}</span>
                              <span>•</span>
                              <span>{item.time}</span>
                              {item.reads ? (
                                <>
                                  <span>•</span>
                                  <span>{item.reads}</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

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

            {showChaptersSidebar && chaptersParent && chaptersPanelVisible ? (
              <aside className={`w-full md:w-80 lg:w-96 h-full flex flex-col border-l shrink-0 transition-all duration-300 ${
                theme === "dark"
                  ? "bg-[#121314] border-neutral-800"
                  : "bg-white border-neutral-100"
              }`}>
                <ChaptersSidebar
                  theme={theme}
                  title={chaptersTitle}
                  items={chaptersItems}
                  loading={chaptersLoading}
                  loadingMore={chaptersLoadingMore}
                  refreshing={chaptersRefreshing}
                  hasMore={chaptersHasMore}
                  canLoadMore={channelCapabilities.canLoadMoreChapters}
                  canRefresh={channelCapabilities.canRefreshChapters || channelCapabilities.hasChapters}
                  parentItem={chaptersParent}
                  activeItemId={activeChapterItem?.id ?? selectedItem?.id}
                  itemLabel={channelCapabilities.chaptersItemLabel}
                  onSelect={handleChapterSelect}
                  onLoadMore={handleChaptersLoadMore}
                  onRefresh={handleChaptersRefresh}
                  onClearAndRefresh={handleChaptersClearAndRefresh}
                />
              </aside>
            ) : null}
          </section>
            </>
          )}
        </main>

      </div>

    </div>
  );
}
