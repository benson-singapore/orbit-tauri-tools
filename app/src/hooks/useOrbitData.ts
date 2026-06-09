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
import { DYNAMIC_SEARCH_MAX_PAGES, isChannelDynamic } from "@/lib/channelStatus";
import type { Article, InstallRSSPluginRequest, Plugin } from "@/types";

function resolveActiveDynamicFeed(plugins: Plugin[], pluginId: string, channelId: string): boolean {
  if (pluginId === "all" || channelId === "all") {
    return false;
  }
  const plugin = plugins.find(p => p.id === pluginId);
  const channel = plugin?.channels?.find(ch => ch.id === channelId);
  return isChannelDynamic(channel);
}

const ALL_PLUGIN: Plugin = INITIAL_PLUGINS[0]!;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const FEED_PAGE_SIZE = 20;
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

interface UseOrbitDataResult {
  plugins: Plugin[];
  articles: Article[];
  unreadTotal: number;
  feedTotal: number;
  loading: boolean;
  searching: boolean;
  loadingMore: boolean;
  hasMore: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const feedRequestId = useRef(0);
  const dynamicPageRef = useRef(1);
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

  const loadPlugins = useCallback(async () => {
    const remote = await fetchPlugins();
    setPlugins([ALL_PLUGIN, ...remote]);
  }, []);

  const loadFeedPage = useCallback(async (options?: {
    offset?: number;
    append?: boolean;
  }) => {
    const requestId = ++feedRequestId.current;
    const append = options?.append ?? false;
    if (!append) {
      dynamicPageRef.current = 1;
    }
    const pluginId = pluginFilterRef.current;
    const channel = channelFilterRef.current;
    const contentType = contentTypeFilterRef.current;
    const search = searchFilterRef.current.trim();
    const dynamicFeed = resolveActiveDynamicFeed(
      pluginsRef.current,
      pluginFilterRef.current,
      channelFilterRef.current,
    );
    let offset = options?.offset ?? 0;
    if (dynamicFeed) {
      if (append) {
        dynamicPageRef.current += 1;
      }
      offset = (dynamicPageRef.current - 1) * FEED_PAGE_SIZE;
    }
    if (dynamicFeed && !search) {
      if (requestId !== feedRequestId.current) {
        return;
      }
      setFeedTotal(0);
      setHasMore(false);
      setArticles(prev => (append ? prev : []));
      if (!append) {
        setUnreadTotal(0);
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
        if (requestId !== feedRequestId.current) {
          return;
        }
        setFeedTotal(0);
        setHasMore(false);
        setArticles(prev => (append ? prev : []));
        if (!append) {
          setUnreadTotal(0);
        }
        return;
      }
    }
    const data = await fetchFeed({
      pluginId: scopeIds.length > 0 ? undefined : pluginId,
      pluginIds: scopeIds.length > 0 ? scopeIds : undefined,
      channel:
        pluginId !== "all" && channel !== "all" ? channel : undefined,
      type:
        pluginId === "all" && contentType && contentType !== "all"
          ? (contentType as import("@/types").ContentType)
          : undefined,
      search: search || undefined,
      limit: FEED_PAGE_SIZE,
      offset,
    });
    if (requestId !== feedRequestId.current) {
      return;
    }
    const items = data.items ?? [];
    const total = data.total ?? (offset + items.length);
    setFeedTotal(total);
    const page = Math.floor(offset / FEED_PAGE_SIZE) + 1;
    const moreFromApi = offset + items.length < total;
    if (typeof data.hasMore === "boolean") {
      setHasMore(data.hasMore);
    } else if (dynamicFeed) {
      setHasMore(items.length > 0 && page < DYNAMIC_SEARCH_MAX_PAGES);
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
      await loadFeedPage({
        offset: 0,
        append: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadPlugins, loadFeedPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const dynamicFeed = resolveActiveDynamicFeed(
        pluginsRef.current,
        pluginFilterRef.current,
        channelFilterRef.current,
      );
      await loadFeedPage(
        dynamicFeed
          ? { append: true }
          : { offset: articles.length, append: true },
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }, [articles.length, hasMore, loadFeedPage, loading, loadingMore]);

  const refreshInBackground = useCallback(async () => {
    try {
      // 后端定时任务负责抓取；此处仅从数据库重新加载列表。
      await loadFeedPage({ offset: 0, append: false });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadFeedPage]);

  const reloadFeedOnly = useCallback(async (options?: { searching?: boolean }) => {
    const isSearchReload = options?.searching === true;
    if (isSearchReload) {
      feedRequestId.current += 1;
      dynamicPageRef.current = 1;
      setArticles([]);
      setHasMore(false);
      setSearching(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
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
  }, [loadFeedPage]);

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
  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => {
      void refreshInBackground();
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [reload, refreshInBackground]);

  const prevSearchFilterRef = useRef(searchFilter);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      prevSearchFilterRef.current = searchFilter;
      return;
    }
    const searchChanged = prevSearchFilterRef.current !== searchFilter;
    prevSearchFilterRef.current = searchFilter;
    void reloadFeedOnly(searchChanged ? { searching: true } : undefined);
  }, [pluginFilter, channelFilter, contentTypeFilter, searchFilter, pluginGroupScopeId, reloadFeedOnly]);

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

      // 先做本地更新，保证按钮点击后立即有视觉反馈
      setPlugins(prev => prev.map(plugin => (
        plugin.id === id ? { ...plugin, active: nextActive } : plugin
      )));

      try {
        await setPluginActive(id, nextActive);
        await loadFeedPage({ offset: 0, append: false });
      } catch (err) {
        // 失败时回滚并刷新，避免 UI 与后端状态不一致
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
      // 手动抓取：清空该插件本地缓存后重新拉取，完成后从数据库刷新列表。
      await refreshPluginFeed(id, undefined, { force: true });
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
    setArticles(prev => prev.map(article => {
      if (article.id !== id || article.isRead) {
        return article;
      }
      wasUnread = true;
      return { ...article, isRead: true };
    }));
    if (wasUnread) {
      setUnreadTotal(prev => Math.max(0, prev - 1));
    }
    try {
      await markFeedItemRead(id);
    } catch {
      setArticles(prev => prev.map(article => (
        article.id === id ? { ...article, isRead: false } : article
      )));
      if (wasUnread) {
        setUnreadTotal(prev => prev + 1);
      }
    }
  }, []);

  return {
    plugins,
    articles,
    unreadTotal,
    feedTotal,
    loading,
    searching,
    loadingMore,
    hasMore,
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
