import { useCallback, useEffect, useRef, useState } from "react";
import { INITIAL_PLUGINS } from "@/data/plugins";
import {
  fetchFeed,
  fetchPlugins,
  installBundledPlugin,
  installRSSPlugin,
  markFeedItemRead,
  refreshPluginFeed,
  setPluginActive,
  uninstallPlugin,
} from "@/lib/feed";
import type { Article, InstallRSSPluginRequest, Plugin } from "@/types";

const ALL_PLUGIN: Plugin = INITIAL_PLUGINS[0]!;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const FEED_PAGE_SIZE = 20;

interface UseOrbitDataResult {
  plugins: Plugin[];
  articles: Article[];
  unreadTotal: number;
  feedTotal: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  reload: (options?: { force?: boolean }) => Promise<void>;
  refreshFromCache: () => Promise<void>;
  loadMore: () => Promise<void>;
  markArticleRead: (id: string) => Promise<void>;
  installCustomRSS: (payload: InstallRSSPluginRequest) => Promise<Plugin>;
  installOfficialPlugin: (id: string) => Promise<Plugin>;
  togglePluginActive: (id: string) => Promise<void>;
  removePlugin: (id: string) => Promise<void>;
  movePlugin: (id: string, direction: "up" | "down") => void;
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedRequestId = useRef(0);
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
    force?: boolean;
    offset?: number;
    append?: boolean;
  }) => {
    const requestId = ++feedRequestId.current;
    const offset = options?.offset ?? 0;
    const append = options?.append ?? false;
    const pluginId = pluginFilterRef.current;
    const channel = channelFilterRef.current;
    const contentType = contentTypeFilterRef.current;
    const search = searchFilterRef.current.trim();
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
      refresh: options?.force ?? false,
      limit: FEED_PAGE_SIZE,
      offset,
    });
    if (requestId !== feedRequestId.current) {
      return;
    }
    const items = data.items ?? [];
    const total = data.total ?? (offset + items.length);
    setFeedTotal(total);
    setHasMore(offset + items.length < total);
    setArticles(prev => (append ? [...prev, ...items] : items));
    if (!append) {
      setUnreadTotal(data.unreadTotal ?? items.filter(item => !item.isRead).length);
    } else if (typeof data.unreadTotal === "number") {
      setUnreadTotal(data.unreadTotal);
    }
  }, []);

  const reload = useCallback(async (options?: { force?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      await loadPlugins();
      await loadFeedPage({
        force: options?.force ?? true,
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
      await loadFeedPage({ force: false, offset: articles.length, append: true });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }, [articles.length, hasMore, loadFeedPage, loading, loadingMore]);

  const refreshInBackground = useCallback(async () => {
    try {
      // 仅触发调度检查：由后端根据每个插件的 refreshInterval 和 lastFetch 决定是否抓取。
      await loadFeedPage({ force: false, offset: 0, append: false });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadFeedPage]);

  const reloadFeedOnly = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadFeedPage({ force: false, offset: 0, append: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadFeedPage]);

  const refreshFromCache = useCallback(async () => {
    setError(null);
    try {
      await loadPlugins();
      await loadFeedPage({ force: false, offset: 0, append: false });
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

  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    void reloadFeedOnly();
  }, [pluginFilter, channelFilter, contentTypeFilter, searchFilter, pluginGroupScopeId, reloadFeedOnly]);

  const installCustomRSS = useCallback(
    async (payload: InstallRSSPluginRequest) => {
      const plugin = await installRSSPlugin(payload);
      await loadPlugins();
      await loadFeedPage({ force: true, offset: 0, append: false });
      return plugin;
    },
    [loadPlugins, loadFeedPage],
  );

  const installOfficialPlugin = useCallback(
    async (id: string) => {
      const plugin = await installBundledPlugin(id);
      await loadPlugins();
      await loadFeedPage({ force: true, offset: 0, append: false });
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
        await loadFeedPage({ force: false, offset: 0, append: false });
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
        await loadFeedPage({ force: false, offset: 0, append: false });
      } catch (err) {
        await loadPlugins();
        await loadFeedPage({ force: false, offset: 0, append: false });
        throw err;
      }
    },
    [loadPlugins, loadFeedPage],
  );

  const forceRefreshPlugin = useCallback(
    async (id: string) => {
      setArticles(prev => prev.filter(article => article.pluginId !== id));
      await refreshPluginFeed(id, undefined, { force: true });
      await loadFeedPage({ force: false, offset: 0, append: false });
    },
    [loadFeedPage],
  );

  const movePlugin = useCallback((id: string, direction: "up" | "down") => {
    setPlugins((prev) => {
      if (prev.length <= 2) return prev;
      const [allPlugin, ...rest] = prev;
      const index = rest.findIndex(plugin => plugin.id === id);
      if (index < 0) return prev;
      if (direction === "up" && index === 0) return prev;
      if (direction === "down" && index === rest.length - 1) return prev;

      const next = [...rest];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
      return [allPlugin, ...next];
    });
  }, []);

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
    loadingMore,
    hasMore,
    error,
    reload,
    refreshFromCache,
    loadMore,
    markArticleRead,
    installCustomRSS,
    installOfficialPlugin,
    togglePluginActive,
    removePlugin,
    movePlugin,
    forceRefreshPlugin,
  };
}
