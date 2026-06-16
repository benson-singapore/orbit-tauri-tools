import { useCallback, useEffect, useRef, useState } from "react";
import { INITIAL_PLUGINS } from "@/data/plugins";
import {
  fetchFeed,
  fetchPlugins,
  installMarketPlugin,
  updateMarketPlugin,
  installRSSPlugin,
  markFeedItemRead,
  refreshPluginFeed,
  reorderPlugins,
  setPluginActive,
  uninstallPlugin,
  updatePluginManifest,
} from "@/lib/feed";
import { isChannelEnabled } from "@/lib/channelStatus";
import { isImageGalleryPlugin } from "@/lib/imagePlugin";
import {
  fetchChannelCapabilities,
  fetchRuntimeItems,
  runtimeLoadMore,
  runtimeRefresh,
  runtimeSearch,
  shouldUseRuntimeV2,
} from "@/lib/runtimeV2";
import { resolveDefaultPluginChannel } from "@/lib/browseDynamicFeed";
import type {
  Article,
  ChannelCapabilities,
  InstallRSSPluginRequest,
  Plugin,
} from "@/types";

const ALL_PLUGIN: Plugin = INITIAL_PLUGINS[0]!;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const FEED_PAGE_SIZE = 20;
export const IMAGE_FEED_PAGE_SIZE = 40;

function resolveFeedPageSize(plugin?: Plugin | null): number {
  return isImageGalleryPlugin(plugin) ? IMAGE_FEED_PAGE_SIZE : FEED_PAGE_SIZE;
}

function resolveFeedChannelId(
  plugin: Plugin | undefined,
  channels: Plugin["channels"],
  channelFilter: string,
  pluginId: string,
): string {
  if (channelFilter !== "all") {
    return channelFilter;
  }
  if (pluginId === "all" || !plugin) {
    return "all";
  }
  const enabled = (channels ?? []).filter(ch => isChannelEnabled(ch.status));
  return resolveDefaultPluginChannel(plugin, enabled);
}

const FEED_RELOAD_DELAYS_MS = [3000, 5000, 10000, 20000, 40000, 60000];

function scheduleFeedReloadAfterBackgroundFetch(
  loadFeedPage: (options?: { offset?: number; append?: boolean }) => Promise<void>,
) {
  void (async () => {
    for (const delay of FEED_RELOAD_DELAYS_MS) {
      await new Promise(resolve => window.setTimeout(resolve, delay));
      await loadFeedPage({ offset: 0, append: false });
    }
  })().catch(console.error);
}

function capabilitiesEqual(a: ChannelCapabilities, b: ChannelCapabilities): boolean {
  return a.canRefresh === b.canRefresh
    && a.canLoadMore === b.canLoadMore
    && a.canLoadMoreChapters === b.canLoadMoreChapters
    && a.canRefreshChapters === b.canRefreshChapters
    && a.canSearch === b.canSearch
    && a.hasDetail === b.hasDetail
    && a.hasChapters === b.hasChapters
    && a.persistList === b.persistList
    && a.chaptersLabel === b.chaptersLabel
    && a.chaptersItemLabel === b.chaptersItemLabel;
}

const DEFAULT_CAPABILITIES: ChannelCapabilities = {
  canRefresh: true,
  canLoadMore: false,
  canLoadMoreChapters: false,
  canRefreshChapters: false,
  canSearch: false,
  hasDetail: false,
  hasChapters: false,
  persistList: true,
};

interface UseOrbitDataResult {
  plugins: Plugin[];
  articles: Article[];
  unreadTotal: number;
  feedTotal: number;
  loading: boolean;
  searching: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  feedPageSize: number;
  channelCapabilities: ChannelCapabilities;
  error: string | null;
  reload: () => Promise<void>;
  refreshFromCache: () => Promise<void>;
  loadMore: () => Promise<void>;
  markArticleRead: (id: string) => Promise<void>;
  installCustomRSS: (payload: InstallRSSPluginRequest) => Promise<Plugin>;
  installOfficialPlugin: (marketId: string) => Promise<Plugin>;
  updateOfficialPlugin: (marketId: string, pluginId: string) => Promise<Plugin>;
  savePluginManifest: (id: string, manifestText: string) => Promise<Plugin>;
  togglePluginActive: (id: string) => Promise<void>;
  removePlugin: (id: string) => Promise<void>;
  movePlugin: (id: string, direction: "up" | "down") => void;
  reorderPlugins: (orderedIds: string[]) => void;
  forceRefreshPlugin: (id: string) => Promise<void>;
}

export function useOrbitData(
  pluginFilter = "all",
  channelFilter = "all",
  contentTypeFilter?: string,
  searchFilter = "",
  pluginGroupScopeId: string | null = null,
  getPluginGroupId?: (pluginId: string) => string,
): UseOrbitDataResult {
  const [plugins, setPlugins] = useState<Plugin[]>(INITIAL_PLUGINS);
  const [articles, setArticles] = useState<Article[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [feedTotal, setFeedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [channelCapabilities, setChannelCapabilities] = useState<ChannelCapabilities>(DEFAULT_CAPABILITIES);
  const channelCapabilitiesRef = useRef<ChannelCapabilities>(DEFAULT_CAPABILITIES);
  const [error, setError] = useState<string | null>(null);
  const feedRequestId = useRef(0);
  const reorderPersistQueue = useRef(Promise.resolve());
  const pluginFilterRef = useRef(pluginFilter);
  const channelFilterRef = useRef(channelFilter);
  const contentTypeFilterRef = useRef(contentTypeFilter);
  const searchFilterRef = useRef(searchFilter);
  const pluginGroupScopeIdRef = useRef(pluginGroupScopeId);
  const getPluginGroupIdRef = useRef(getPluginGroupId);
  const pluginsRef = useRef(plugins);
  pluginFilterRef.current = pluginFilter;
  channelFilterRef.current = channelFilter;
  contentTypeFilterRef.current = contentTypeFilter;
  searchFilterRef.current = searchFilter;
  pluginGroupScopeIdRef.current = pluginGroupScopeId;
  getPluginGroupIdRef.current = getPluginGroupId;
  pluginsRef.current = plugins;
  channelCapabilitiesRef.current = channelCapabilities;

  const loadPlugins = useCallback(async () => {
    const remote = await fetchPlugins();
    setPlugins([ALL_PLUGIN, ...remote]);
  }, []);

  const loadChannelCapabilities = useCallback(async (pluginId: string, channelId: string) => {
    const plugin = pluginsRef.current.find(p => p.id === pluginId);
    if (!shouldUseRuntimeV2(pluginId, plugin) || channelId === "all") {
      setChannelCapabilities(DEFAULT_CAPABILITIES);
      return;
    }
    try {
      const cap = await fetchChannelCapabilities(pluginId, channelId);
      setChannelCapabilities(prev =>
        capabilitiesEqual(prev, cap) ? prev : cap,
      );
    } catch {
      setChannelCapabilities(prev =>
        capabilitiesEqual(prev, DEFAULT_CAPABILITIES) ? prev : DEFAULT_CAPABILITIES,
      );
    }
  }, []);

  const loadFeedPage = useCallback(async (options?: {
    offset?: number;
    append?: boolean;
  }) => {
    const requestId = ++feedRequestId.current;
    const append = options?.append ?? false;
    const pluginId = pluginFilterRef.current;
    const channel = channelFilterRef.current;
    const contentType = contentTypeFilterRef.current;
    const search = searchFilterRef.current.trim();
    const plugin = pluginsRef.current.find(p => p.id === pluginId);
    const pageSize = resolveFeedPageSize(plugin);
    const pluginChannels = (plugin?.channels ?? []).filter(ch =>
      isChannelEnabled(ch.status),
    );
    const feedChannel = resolveFeedChannelId(plugin, pluginChannels, channel, pluginId);
    const offset = options?.offset ?? 0;

    if (shouldUseRuntimeV2(pluginId, plugin) && feedChannel !== "all") {
      if (search) {
        const result = await runtimeSearch(pluginId, feedChannel, search);
        if (requestId !== feedRequestId.current) return;
        const items = result.items ?? [];
        setFeedTotal(items.length);
        setHasMore(Boolean(result.hasMore));
        setArticles(prev => (append ? [...prev, ...items] : items));
        if (!append) {
          setUnreadTotal(items.filter(item => !item.isRead).length);
        }
        return;
      }

      const cap = channelCapabilitiesRef.current;
      if (cap.canSearch && !search) {
        if (requestId !== feedRequestId.current) return;
        setFeedTotal(0);
        setHasMore(false);
        setArticles(prev => (append ? prev : []));
        if (!append) setUnreadTotal(0);
        return;
      }

      if (append) {
        const cap = channelCapabilitiesRef.current;
        const result = cap.canLoadMore
          ? await runtimeLoadMore(pluginId, feedChannel)
          : await fetchRuntimeItems({
              pluginId,
              channelId: feedChannel,
              limit: pageSize,
              offset,
            });
        if (requestId !== feedRequestId.current) return;
        const items = result.items ?? [];
        setArticles(prev => [...prev, ...items]);
        setFeedTotal(offset + items.length);
        setHasMore(Boolean(result.hasMore));
        return;
      }

      const result = await fetchRuntimeItems({
        pluginId,
        channelId: feedChannel,
        limit: pageSize,
        offset,
      });
      if (requestId !== feedRequestId.current) return;
      const items = result.items ?? [];
      setFeedTotal(offset + items.length);
      setHasMore(Boolean(result.hasMore));
      setArticles(items);
      if (!append) {
        setUnreadTotal(items.filter(item => !item.isRead).length);
      }
      return;
    }

    let scopeIds: string[] = [];
    const groupScopeId = pluginGroupScopeIdRef.current;
    if (pluginId === "all" && groupScopeId) {
      const resolveGroup = getPluginGroupIdRef.current;
      if (resolveGroup) {
        scopeIds = pluginsRef.current
          .filter(
            p =>
              p.id !== "all" &&
              p.active !== false &&
              resolveGroup(p.id) === groupScopeId,
          )
          .map(p => p.id);
      }
      if (scopeIds.length === 0) {
        if (requestId !== feedRequestId.current) return;
        setFeedTotal(0);
        setHasMore(false);
        setArticles(prev => (append ? prev : []));
        if (!append) setUnreadTotal(0);
        return;
      }
    }

    const data = await fetchFeed({
      pluginId: scopeIds.length > 0 ? undefined : pluginId,
      pluginIds: scopeIds.length > 0 ? scopeIds : undefined,
      channel:
        pluginId !== "all" && feedChannel !== "all" ? feedChannel : undefined,
      type:
        pluginId === "all" && contentType && contentType !== "all"
          ? (contentType as import("@/types").ContentType)
          : undefined,
      search: search || undefined,
      limit: pageSize,
      offset,
    });
    if (requestId !== feedRequestId.current) return;
    const items = data.items ?? [];
    const total = data.total ?? (offset + items.length);
    setFeedTotal(total);
    const moreFromApi = offset + items.length < total;
    if (typeof data.hasMore === "boolean") {
      setHasMore(data.hasMore);
    } else {
      setHasMore(moreFromApi);
    }
    setArticles(prev => (append ? [...prev, ...items] : items));
    if (!append) {
      setUnreadTotal(data.unreadTotal ?? items.filter(item => !item.isRead).length);
    } else if (typeof data.unreadTotal === "number") {
      setUnreadTotal(data.unreadTotal);
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadPlugins();
      const plugin = pluginsRef.current.find(p => p.id === pluginFilterRef.current);
      const feedChannel = resolveFeedChannelId(
        plugin,
        plugin?.channels,
        channelFilterRef.current,
        pluginFilterRef.current,
      );
      if (shouldUseRuntimeV2(pluginFilterRef.current, plugin) && feedChannel !== "all") {
        await loadChannelCapabilities(pluginFilterRef.current, feedChannel);
      }
      await loadFeedPage({ offset: 0, append: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadPlugins, loadFeedPage, loadChannelCapabilities]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    try {
      await loadFeedPage({ offset: articles.length, append: true });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }, [articles.length, hasMore, loadFeedPage, loading, loadingMore]);

  const refreshInBackground = useCallback(async () => {
    try {
      await loadFeedPage({ offset: 0, append: false });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadFeedPage]);

  const reloadFeedOnly = useCallback(async (options?: { searching?: boolean }) => {
    const isSearchReload = options?.searching === true;
    feedRequestId.current += 1;
    setArticles([]);
    setHasMore(false);
    if (isSearchReload) {
      setSearching(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const plugin = pluginsRef.current.find(p => p.id === pluginFilterRef.current);
      const feedChannel = resolveFeedChannelId(
        plugin,
        plugin?.channels,
        channelFilterRef.current,
        pluginFilterRef.current,
      );
      if (shouldUseRuntimeV2(pluginFilterRef.current, plugin) && feedChannel !== "all") {
        await loadChannelCapabilities(pluginFilterRef.current, feedChannel);
      }
      await loadFeedPage({ offset: 0, append: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isSearchReload) {
        setSearching(false);
      } else {
        setLoading(false);
      }
    }
  }, [loadFeedPage, loadChannelCapabilities]);

  const refreshFromCache = useCallback(async () => {
    setError(null);
    try {
      await loadPlugins();
      await loadFeedPage({ offset: 0, append: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [loadPlugins, loadFeedPage]);

  const initialMount = useRef(true);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const refreshInBackgroundRef = useRef(refreshInBackground);
  refreshInBackgroundRef.current = refreshInBackground;
  const reloadFeedOnlyRef = useRef(reloadFeedOnly);
  reloadFeedOnlyRef.current = reloadFeedOnly;

  useEffect(() => {
    void reloadRef.current();
    const timer = window.setInterval(() => {
      void refreshInBackgroundRef.current();
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const prevSearchFilterRef = useRef(searchFilter);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      prevSearchFilterRef.current = searchFilter;
      return;
    }
    const searchChanged = prevSearchFilterRef.current !== searchFilter;
    prevSearchFilterRef.current = searchFilter;
    void reloadFeedOnlyRef.current(searchChanged ? { searching: true } : undefined);
  }, [pluginFilter, channelFilter, contentTypeFilter, searchFilter, pluginGroupScopeId]);

  const installCustomRSS = useCallback(
    async (payload: InstallRSSPluginRequest) => {
      const plugin = await installRSSPlugin(payload);
      await loadPlugins();
      void refreshPluginFeed(plugin.id)
        .then(() => loadFeedPage({ offset: 0, append: false }))
        .catch(console.error);
      return plugin;
    },
    [loadPlugins, loadFeedPage],
  );

  const installOfficialPlugin = useCallback(
    async (marketId: string) => {
      const plugin = await installMarketPlugin(marketId);
      await loadPlugins();
      scheduleFeedReloadAfterBackgroundFetch(loadFeedPage);
      return plugin;
    },
    [loadPlugins, loadFeedPage],
  );

  const updateOfficialPlugin = useCallback(
    async (marketId: string, pluginId: string) => {
      const plugin = await updateMarketPlugin(marketId, pluginId);
      await loadPlugins();
      scheduleFeedReloadAfterBackgroundFetch(loadFeedPage);
      return plugin;
    },
    [loadPlugins, loadFeedPage],
  );

  const savePluginManifest = useCallback(
    async (id: string, manifestText: string) => {
      const plugin = await updatePluginManifest(id, manifestText);
      await loadPlugins();
      void refreshPluginFeed(id)
        .then(() => loadFeedPage({ offset: 0, append: false }))
        .catch(console.error);
      return plugin;
    },
    [loadPlugins, loadFeedPage],
  );

  const togglePluginActive = useCallback(
    async (id: string) => {
      const target = plugins.find(p => p.id === id);
      if (!target) return;
      const currentlyActive = target?.active !== false;
      const nextActive = !currentlyActive;
      setPlugins(prev => prev.map(plugin => (
        plugin.id === id ? { ...plugin, active: nextActive } : plugin
      )));
      try {
        await setPluginActive(id, nextActive);
        await loadFeedPage({ offset: 0, append: false });
      } catch (err) {
        setPlugins(prev => prev.map(plugin => (
          plugin.id === id ? { ...plugin, active: currentlyActive } : plugin
        )));
        await loadPlugins();
        throw err;
      }
    },
    [plugins, loadPlugins, loadFeedPage],
  );

  const removePlugin = useCallback(
    async (id: string) => {
      setPlugins(prev => prev.filter(plugin => plugin.id !== id));
      setArticles(prev => prev.filter(article => article.pluginId !== id));
      try {
        await uninstallPlugin(id);
        await loadFeedPage({ offset: 0, append: false });
      } catch (err) {
        await loadPlugins();
        await loadFeedPage({ offset: 0, append: false });
        throw err;
      }
    },
    [loadPlugins, loadFeedPage],
  );

  const forceRefreshPlugin = useCallback(
    async (id: string) => {
      const plugin = pluginsRef.current.find(p => p.id === id);
      const feedChannel = resolveFeedChannelId(
        plugin,
        plugin?.channels,
        channelFilterRef.current,
        id,
      );
      if (shouldUseRuntimeV2(id, plugin) && feedChannel !== "all") {
        await runtimeRefresh(id, feedChannel);
      } else {
        await refreshPluginFeed(id, undefined, { force: true });
      }
      await loadPlugins();
      await loadFeedPage({ offset: 0, append: false });
    },
    [loadPlugins, loadFeedPage],
  );

  const persistPluginOrder = useCallback((orderedIds: string[]) => {
    reorderPersistQueue.current = reorderPersistQueue.current
      .then(() => reorderPlugins(orderedIds))
      .catch(err => {
        console.error("failed to persist plugin order:", err);
        return loadPlugins();
      });
  }, [loadPlugins]);

  const applyPluginOrder = useCallback((orderedIds: string[]) => {
    const prev = pluginsRef.current;
    if (prev.length <= 1 || orderedIds.length === 0) return;
    const [allPlugin, ...rest] = prev;
    const byId = new Map(rest.map(plugin => [plugin.id, plugin]));
    const next = orderedIds
      .map(id => byId.get(id))
      .filter((plugin): plugin is Plugin => !!plugin);
    if (next.length !== rest.length) return;
    const withSort = next.map((plugin, sortIndex) => ({ ...plugin, sort: sortIndex }));
    setPlugins([allPlugin, ...withSort]);
    persistPluginOrder(withSort.map(plugin => plugin.id));
  }, [persistPluginOrder]);

  const movePlugin = useCallback((id: string, direction: "up" | "down") => {
    const prev = pluginsRef.current;
    if (prev.length <= 2) return;
    const rest = prev.filter(plugin => plugin.id !== "all");
    const index = rest.findIndex(plugin => plugin.id === id);
    if (index < 0) return;
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === rest.length - 1) return;
    const next = [...rest];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
    applyPluginOrder(next.map(plugin => plugin.id));
  }, [applyPluginOrder]);

  const reorderPluginsByIds = useCallback((orderedIds: string[]) => {
    applyPluginOrder(orderedIds);
  }, [applyPluginOrder]);

  const markArticleRead = useCallback(async (id: string) => {
    let wasUnread = false;
    let pluginId: string | undefined;
    let channelId: string | undefined;
    setArticles(prev => {
      const target = prev.find(article => article.id === id);
      if (!target || target.isRead) return prev;
      wasUnread = true;
      pluginId = target.pluginId;
      channelId = target.channelId;
      return prev.map(article =>
        article.id === id ? { ...article, isRead: true } : article,
      );
    });
    if (wasUnread) {
      setUnreadTotal(prev => Math.max(0, prev - 1));
    }
    try {
      await markFeedItemRead(id, { pluginId, channelId });
    } catch {
      setArticles(prev => prev.map(article => (
        article.id === id ? { ...article, isRead: false } : article
      )));
      if (wasUnread) {
        setUnreadTotal(prev => prev + 1);
      }
    }
  }, []);

  const feedPageSize = resolveFeedPageSize(
    plugins.find(p => p.id === pluginFilter),
  );

  return {
    plugins,
    articles,
    unreadTotal,
    feedTotal,
    loading,
    searching,
    loadingMore,
    hasMore,
    feedPageSize,
    channelCapabilities,
    error,
    reload,
    refreshFromCache,
    loadMore,
    markArticleRead,
    installCustomRSS,
    installOfficialPlugin,
    updateOfficialPlugin,
    savePluginManifest,
    togglePluginActive,
    removePlugin,
    movePlugin,
    reorderPlugins: reorderPluginsByIds,
    forceRefreshPlugin,
  };
}
