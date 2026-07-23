import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  setPluginIncludeInAll,
  uninstallPlugin,
  updatePluginManifest,
} from "@/lib/feed";
import { isChannelEnabled } from "@/lib/channelStatus";
import { isPluginFavoritesChannel } from "@/lib/pluginFavorites";
import { resolvePluginIncludeInAll } from "@/lib/pluginIncludeInAll";
import {
  fetchChannelCapabilities,
  fetchRuntimeItems,
  invalidatePluginVariablesCache,
  markPluginVariablesReady,
  runtimeLoadMore,
  runtimeRefresh,
  runtimeClearRefresh,
  runtimeSearch,
  shouldUseRuntimeV2,
  type RuntimeCallOptions,
} from "@/lib/runtimeV2";
import { isSocialPlugin } from "@/lib/socialPlugin";
import { resolveDefaultPluginChannel } from "@/lib/browseDynamicFeed";
import { withBrowserSessionRetry } from "@/lib/browserSessionFlow";
import {
  inferBrowserSessionForPlugin,
  pluginNeedsBrowserSessionRecovery,
} from "@/lib/browserSessionError";
import { isPluginSessionActive } from "@/lib/pluginSession";
import { requestBrowserSession, registerBrowserSessionReadyHandler } from "@/lib/browserSessionGate";
import { savePluginVariables } from "@/lib/runtimeV2";
import {
  buildFeedLoadMoreParams,
  buildSearchLoadMoreParams,
  channelSupportsLoadMore,
  resolveFeedHasMore,
} from "@/lib/paginationParams";
import type {
  Article,
  ChannelCapabilities,
  InstallRSSPluginRequest,
  Plugin,
  BrowserSessionPluginContext,
} from "@/types";

const ALL_PLUGIN: Plugin = INITIAL_PLUGINS[0]!;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const FEED_PAGE_SIZE = 20;

function resolveFeedPageSize(_plugin?: Plugin | null): number {
  return FEED_PAGE_SIZE;
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

const FEED_RELOAD_DELAYS_MS = [1500, 3000, 5000, 10000, 20000, 40000, 60000];

function buildFeedKey(
  pluginId: string,
  channelId: string,
  contentType: string | undefined,
  search: string,
  pluginGroupScopeId: string | null,
): string {
  return `${pluginId}|${channelId}|${contentType ?? ""}|${search}|${pluginGroupScopeId ?? ""}`;
}

type FeedCacheEntry = {
  articles: Article[];
  hasMore: boolean;
  feedTotal: number;
  feedNextParams: Record<string, string> | null;
};

const feedCache = new Map<string, FeedCacheEntry>();

function snapshotCurrentFeed(
  feedKey: string,
  articles: Article[],
  hasMore: boolean,
  feedTotal: number,
  feedNextParams: Record<string, string> | null,
): void {
  if (articles.length === 0) return;
  feedCache.set(feedKey, {
    articles,
    hasMore,
    feedTotal,
    feedNextParams,
  });
}

function mergeArticlesPreservingReadState(prev: Article[], items: Article[]): Article[] {
  if (prev.length === 0) {
    return items;
  }
  const readIds = new Set(prev.filter(article => article.isRead).map(article => article.id));
  if (readIds.size === 0) {
    return items;
  }
  return items.map(item => (readIds.has(item.id) ? { ...item, isRead: true } : item));
}

function runtimeOptionsForPlugin(plugin?: Plugin): RuntimeCallOptions | undefined {
  if (!plugin) return undefined;
  const context: BrowserSessionPluginContext = {
    id: plugin.id,
    name: plugin.name,
    browser: plugin.browser,
    variablesSchema: plugin.variablesSchema,
    channels: plugin.channels,
    lastError: plugin.lastError,
  };
  const session = inferBrowserSessionForPlugin(context);
  return {
    variablesSchema: plugin.variablesSchema,
    variablesReady: plugin.variablesReady,
    browserSessionPlugin: session ? context : undefined,
  };
}

async function refreshPluginWithSession(
  plugin: Plugin | undefined,
  refreshFn: () => Promise<void>,
): Promise<void> {
  await withBrowserSessionRetry(plugin, refreshFn);
}

function shouldScheduleBackgroundFeedReload(
  pluginId: string,
  feedChannel: string,
  itemCount: number,
  append: boolean,
  plugins: Plugin[],
  capabilities: ChannelCapabilities,
  search: string,
  pending: boolean,
): boolean {
  if (append || itemCount !== 0 || !pending) return false;
  if (pluginId === "all" || feedChannel === "all") return false;

  const plugin = plugins.find(p => p.id === pluginId);
  if (!shouldUseRuntimeV2(pluginId, plugin)) return false;
  if (capabilities.canSearch && !search.trim()) return false;

  return capabilities.canRefresh;
}

function scheduleFeedReloadAfterBackgroundFetch(
  loadFeedPage: (options?: { offset?: number; append?: boolean }) => Promise<number>,
  getContext: () => { pluginId: string; channelId: string },
  isPending?: () => boolean,
  recoverSession?: (pluginId: string) => Promise<boolean>,
) {
  void (async () => {
    const context = getContext();
    for (const delay of FEED_RELOAD_DELAYS_MS) {
      const current = getContext();
      if (
        current.pluginId !== context.pluginId
        || current.channelId !== context.channelId
      ) {
        return;
      }
      await new Promise(resolve => window.setTimeout(resolve, delay));
      const itemCount = await loadFeedPage({ offset: 0, append: false });
      if (itemCount > 0 || itemCount < 0) return;
      if (isPending && !isPending()) {
        if (recoverSession) {
          const recovered = await recoverSession(context.pluginId);
          if (recovered) continue;
        }
        return;
      }
    }
  })().catch(console.error);
}

function capabilitiesEqual(a: ChannelCapabilities, b: ChannelCapabilities): boolean {
  const pagEqual = JSON.stringify(a.pagination ?? null) === JSON.stringify(b.pagination ?? null);
  const playbackEqual = JSON.stringify(a.playback ?? null) === JSON.stringify(b.playback ?? null);
  return pagEqual
    && playbackEqual
    && a.canRefresh === b.canRefresh
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
  markArticleRead: (target: string | Article) => Promise<void>;
  installCustomRSS: (payload: InstallRSSPluginRequest) => Promise<Plugin>;
  installOfficialPlugin: (
    marketId: string,
    contentRating?: import("@/types").MarketPluginContentRating,
  ) => Promise<Plugin>;
  updateOfficialPlugin: (
    marketId: string,
    pluginId: string,
    contentRating?: import("@/types").MarketPluginContentRating,
  ) => Promise<Plugin>;
  savePluginManifest: (id: string, manifestText: string) => Promise<Plugin>;
  togglePluginActive: (id: string) => Promise<void>;
  togglePluginIncludeInAll: (id: string) => Promise<void>;
  removePlugin: (id: string) => Promise<void>;
  movePlugin: (id: string, direction: "up" | "down") => void;
  reorderPlugins: (orderedIds: string[]) => void;
  forceRefreshPlugin: (id: string) => Promise<void>;
  refreshChannelFeed: () => Promise<void>;
  clearRefreshChannelFeed: () => Promise<void>;
}

function resolveMarkReadContext(
  target: string | Article,
  articles: Article[],
  pluginFilter: string,
  channelFilter: string,
): { id: string; pluginId: string; channelId?: string } | null {
  const id = typeof target === "string" ? target : target.id;
  const article = typeof target === "string"
    ? articles.find(item => item.id === target)
    : target;
  const pluginId = article?.pluginId
    ?? (pluginFilter !== "all" ? pluginFilter : undefined);
  const channelId = article?.channelId
    ?? (channelFilter !== "all" ? channelFilter : undefined);
  if (!pluginId) {
    return null;
  }
  return { id, pluginId, channelId };
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
  const [awaitingBackgroundRefresh, setAwaitingBackgroundRefresh] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [channelCapabilities, setChannelCapabilities] = useState<ChannelCapabilities>(DEFAULT_CAPABILITIES);
  const channelCapabilitiesRef = useRef<ChannelCapabilities>(DEFAULT_CAPABILITIES);
  const [error, setError] = useState<string | null>(null);
  const feedRequestId = useRef(0);
  const feedNextParamsRef = useRef<Record<string, string> | null>(null);
  const feedPaginationExhaustedRef = useRef(false);
  const loadMoreInFlightRef = useRef(false);
  const loadMoreBlockedRef = useRef(false);
  const backgroundPollGenerationRef = useRef(0);
  const browserSessionRecoveryAttemptedRef = useRef<string | null>(null);
  const recoverBrowserSessionRef = useRef<
    (pluginId: string, options?: { allowEmptyFeed?: boolean }) => Promise<boolean>
  >(
    async () => false,
  );
  const feedListPendingRef = useRef(false);
  const settledFeedKeyRef = useRef<string | null>(null);
  const reorderPersistQueue = useRef(Promise.resolve());
  const pluginFilterRef = useRef(pluginFilter);
  const channelFilterRef = useRef(channelFilter);
  const contentTypeFilterRef = useRef(contentTypeFilter);
  const searchFilterRef = useRef(searchFilter);
  const pluginGroupScopeIdRef = useRef(pluginGroupScopeId);
  const getPluginGroupIdRef = useRef(getPluginGroupId);
  const pluginsRef = useRef(plugins);
  const articlesRef = useRef(articles);
  const hasMoreRef = useRef(hasMore);
  const feedTotalRef = useRef(feedTotal);
  pluginFilterRef.current = pluginFilter;
  channelFilterRef.current = channelFilter;
  contentTypeFilterRef.current = contentTypeFilter;
  searchFilterRef.current = searchFilter;
  pluginGroupScopeIdRef.current = pluginGroupScopeId;
  getPluginGroupIdRef.current = getPluginGroupId;
  pluginsRef.current = plugins;
  articlesRef.current = articles;
  hasMoreRef.current = hasMore;
  feedTotalRef.current = feedTotal;
  channelCapabilitiesRef.current = channelCapabilities;

  const commitFeedSettled = useCallback(() => {
    settledFeedKeyRef.current = buildFeedKey(
      pluginFilterRef.current,
      channelFilterRef.current,
      contentTypeFilterRef.current,
      searchFilterRef.current,
      pluginGroupScopeIdRef.current,
    );
  }, []);

  const loadPlugins = useCallback(async (): Promise<Plugin[]> => {
    const remote = await fetchPlugins();
    for (const plugin of remote) {
      if (plugin.variablesReady) {
        markPluginVariablesReady(plugin.id);
      } else {
        invalidatePluginVariablesCache(plugin.id);
      }
    }
    setPlugins([ALL_PLUGIN, ...remote]);
    return remote;
  }, []);

  const loadChannelCapabilities = useCallback(async (pluginId: string, channelId: string) => {
    const plugin = pluginsRef.current.find(p => p.id === pluginId);
    if (
      !shouldUseRuntimeV2(pluginId, plugin)
      || channelId === "all"
      || isPluginFavoritesChannel(channelId)
    ) {
      channelCapabilitiesRef.current = DEFAULT_CAPABILITIES;
      setChannelCapabilities(DEFAULT_CAPABILITIES);
      return;
    }
    try {
      const cap = await fetchChannelCapabilities(pluginId, channelId);
      channelCapabilitiesRef.current = cap;
      setChannelCapabilities(prev =>
        capabilitiesEqual(prev, cap) ? prev : cap,
      );
    } catch {
      channelCapabilitiesRef.current = DEFAULT_CAPABILITIES;
      setChannelCapabilities(prev =>
        capabilitiesEqual(prev, DEFAULT_CAPABILITIES) ? prev : DEFAULT_CAPABILITIES,
      );
    }
  }, []);

  const loadFeedPage = useCallback(async (options?: {
    offset?: number;
    append?: boolean;
  }): Promise<number> => {
    const requestId = ++feedRequestId.current;
    const append = options?.append ?? false;
    const pluginId = pluginFilterRef.current;
    const channel = channelFilterRef.current;
    const isStaleRequest = () =>
      requestId !== feedRequestId.current
      || pluginFilterRef.current !== pluginId
      || channelFilterRef.current !== channel;
    const contentType = contentTypeFilterRef.current;
    const search = searchFilterRef.current.trim();
    const plugin = pluginsRef.current.find(p => p.id === pluginId);
    const pageSize = resolveFeedPageSize(plugin);
    const pluginChannels = (plugin?.channels ?? []).filter(ch =>
      isChannelEnabled(ch.status),
    );
    const feedChannel = resolveFeedChannelId(plugin, pluginChannels, channel, pluginId);
    const offset = options?.offset ?? 0;
    const activeChannel = pluginChannels.find(ch => ch.id === feedChannel);

    const finishFeedPage = (itemCount: number, pending = false) => {
      feedListPendingRef.current = pending;
      commitFeedSettled();
      return itemCount;
    };

    if (isPluginFavoritesChannel(channel) || isPluginFavoritesChannel(feedChannel)) {
      if (!isStaleRequest()) {
        setArticles([]);
        setHasMore(false);
        setFeedTotal(0);
        feedNextParamsRef.current = null;
      }
      return finishFeedPage(0);
    }

    if (shouldUseRuntimeV2(pluginId, plugin) && feedChannel !== "all") {
      const runtimeOptions = runtimeOptionsForPlugin(plugin);
      if (search) {
        const cap = channelCapabilitiesRef.current;
        const pagination = cap.pagination ?? activeChannel?.features?.pagination;
        const paginated = channelSupportsLoadMore(cap, activeChannel);
        const searchParam = activeChannel?.features?.search?.param?.trim() || "query";
        let result;
        if (append) {
          const loadMoreParams = buildSearchLoadMoreParams({
            pagination,
            articles: articlesRef.current,
            pageSize,
            query: search,
            searchParam,
            channelParams: activeChannel?.params,
            nextParams: feedNextParamsRef.current,
          });
          result = await runtimeLoadMore(pluginId, feedChannel, loadMoreParams, runtimeOptions);
        } else {
          feedNextParamsRef.current = null;
          feedPaginationExhaustedRef.current = false;
          result = await runtimeSearch(pluginId, feedChannel, search, runtimeOptions);
        }
        feedNextParamsRef.current = result.next ?? null;
        if (isStaleRequest()) return -1;
        const items = result.items ?? [];
        if (append && paginated && items.length === 0) {
          feedPaginationExhaustedRef.current = true;
        }
        setFeedTotal(append ? articlesRef.current.length + items.length : items.length);
        setHasMore(resolveFeedHasMore({
          append,
          items,
          apiHasMore: result.hasMore,
          paginated,
          paginationExhausted: feedPaginationExhaustedRef.current,
        }));
        setArticles(prev => (append ? [...prev, ...items] : mergeArticlesPreservingReadState(prev, items)));
        if (!append) {
          setUnreadTotal(items.filter(item => !item.isRead).length);
        }
        return finishFeedPage(items.length, Boolean(result.pending));
      }

      const cap = channelCapabilitiesRef.current;
      if (cap.canSearch && !search) {
        if (isStaleRequest()) return -1;
        setFeedTotal(0);
        setHasMore(false);
        setArticles(prev => (append ? prev : []));
        if (!append) setUnreadTotal(0);
        return finishFeedPage(0);
      }

      if (append) {
        const paginated = channelSupportsLoadMore(cap, activeChannel);
        let result;
        if (cap.canLoadMore) {
          const pagination = cap.pagination ?? activeChannel?.features?.pagination;
          const loadMoreParams = pagination
            ? buildFeedLoadMoreParams({
                pagination,
                articles: articlesRef.current,
                pageSize,
                channelParams: activeChannel?.params,
                nextParams: feedNextParamsRef.current,
              })
            : undefined;
          result = await runtimeLoadMore(pluginId, feedChannel, loadMoreParams, runtimeOptions);
          feedNextParamsRef.current = result.next ?? null;
        } else {
          result = await fetchRuntimeItems({
            pluginId,
            channelId: feedChannel,
            limit: pageSize,
            offset,
          });
        }
        if (isStaleRequest()) return -1;
        const items = result.items ?? [];
        if (paginated && items.length === 0) {
          feedPaginationExhaustedRef.current = true;
        }
        setArticles(prev => [...prev, ...items]);
        setFeedTotal(offset + items.length);
        setHasMore(resolveFeedHasMore({
          append: true,
          items,
          apiHasMore: result.hasMore,
          paginated,
          paginationExhausted: feedPaginationExhaustedRef.current,
        }));
        return finishFeedPage(items.length, Boolean(result.pending));
      }

      feedPaginationExhaustedRef.current = false;

      const result = await fetchRuntimeItems({
        pluginId,
        channelId: feedChannel,
        limit: pageSize,
        offset,
      });
      if (isStaleRequest()) return -1;
      const items = result.items ?? [];
      feedNextParamsRef.current = result.next ?? null;
      const paginated = channelSupportsLoadMore(cap, activeChannel);
      setFeedTotal(offset + items.length);
      setHasMore(resolveFeedHasMore({
        append: false,
        items,
        apiHasMore: result.hasMore,
        paginated,
        paginationExhausted: feedPaginationExhaustedRef.current,
      }));
      setArticles(prev => mergeArticlesPreservingReadState(prev, items));
      if (!append) {
        setUnreadTotal(items.filter(item => !item.isRead).length);
      }
      const itemCount = finishFeedPage(items.length, Boolean(result.pending));
      if (
        !append
        && items.length === 0
        && !result.pending
        && pluginId !== "all"
      ) {
        void recoverBrowserSessionRef.current(pluginId, { allowEmptyFeed: true }).then(recovered => {
          if (recovered) {
            void loadFeedPage({ offset: 0, append: false });
          }
        });
      }
      return itemCount;
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
        if (isStaleRequest()) return -1;
        setFeedTotal(0);
        setHasMore(false);
        setArticles(prev => (append ? prev : []));
        if (!append) setUnreadTotal(0);
        return finishFeedPage(0);
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
    if (isStaleRequest()) return -1;
    const items = data.items ?? [];
    const total = data.total ?? (offset + items.length);
    setFeedTotal(total);
    const moreFromApi = offset + items.length < total;
    if (append && items.length === 0) {
      setHasMore(false);
    } else if (typeof data.hasMore === "boolean") {
      setHasMore(data.hasMore);
    } else {
      setHasMore(moreFromApi);
    }
    setArticles(prev => (append ? [...prev, ...items] : mergeArticlesPreservingReadState(prev, items)));
    if (!append) {
      setUnreadTotal(data.unreadTotal ?? items.filter(item => !item.isRead).length);
    } else if (typeof data.unreadTotal === "number") {
      setUnreadTotal(data.unreadTotal);
    }
    return finishFeedPage(items.length);
  }, [commitFeedSettled]);

  const cancelBackgroundFeedPolling = useCallback(() => {
    backgroundPollGenerationRef.current += 1;
    setAwaitingBackgroundRefresh(false);
  }, []);

  const recoverBrowserSessionIfNeeded = useCallback(async (
    pluginId: string,
    options?: { allowEmptyFeed?: boolean },
  ) => {
    if (browserSessionRecoveryAttemptedRef.current === pluginId) return false;
    if (isPluginSessionActive(pluginId)) return false;

    const remote = await loadPlugins();
    const plugin = remote.find(item => item.id === pluginId);
    if (!pluginNeedsBrowserSessionRecovery(plugin, options)) return false;

    const session = inferBrowserSessionForPlugin(plugin!);
    if (!session) return false;

    browserSessionRecoveryAttemptedRef.current = pluginId;
    const feedChannel = resolveFeedChannelId(
      plugin,
      plugin?.channels,
      channelFilterRef.current,
      pluginId,
    );
    const channel = plugin?.channels?.find(item => item.id === feedChannel);
    const startUrl = channel?.params?.url?.trim();
    const sessionWithUrl = startUrl ? { ...session, startUrl } : session;
    try {
      await savePluginVariables(session.pluginId, { cookie: "", userAgent: "" });
      const values = await requestBrowserSession(sessionWithUrl);
      if (!values) {
        browserSessionRecoveryAttemptedRef.current = null;
        return false;
      }
      console.info("[browser-session] saving variables", {
        pluginId: session.pluginId,
        keys: Object.keys(values),
        cookieLen: values.cookie?.length ?? 0,
        userAgentLen: values.userAgent?.length ?? 0,
      });
      await savePluginVariables(session.pluginId, values);
      if (shouldUseRuntimeV2(pluginId, plugin) && feedChannel !== "all") {
        await runtimeRefresh(pluginId, feedChannel, runtimeOptionsForPlugin(plugin));
      } else {
        await refreshPluginFeed(pluginId, feedChannel, { force: true });
      }
      await loadPlugins();
      await loadFeedPage({ offset: 0, append: false });
      browserSessionRecoveryAttemptedRef.current = null;
      return true;
    } catch (err) {
      console.error("browser session recovery failed", err);
      browserSessionRecoveryAttemptedRef.current = null;
      return false;
    }
  }, [loadPlugins, loadFeedPage]);

  recoverBrowserSessionRef.current = recoverBrowserSessionIfNeeded;

  const pollFeedUntilData = useCallback(async (
    context: { pluginId: string; channelId: string },
  ) => {
    const pollGeneration = backgroundPollGenerationRef.current;
    setAwaitingBackgroundRefresh(true);

    try {
      for (const delay of FEED_RELOAD_DELAYS_MS) {
        if (pollGeneration !== backgroundPollGenerationRef.current) return;
        if (
          pluginFilterRef.current !== context.pluginId
          || channelFilterRef.current !== context.channelId
        ) {
          return;
        }

        await new Promise(resolve => window.setTimeout(resolve, delay));

        if (pollGeneration !== backgroundPollGenerationRef.current) return;
        if (
          pluginFilterRef.current !== context.pluginId
          || channelFilterRef.current !== context.channelId
        ) {
          return;
        }

        const itemCount = await loadFeedPage({ offset: 0, append: false });
        if (itemCount > 0 || itemCount < 0) return;
        if (!feedListPendingRef.current) {
          const recovered = await recoverBrowserSessionIfNeeded(context.pluginId, {
            allowEmptyFeed: true,
          });
          if (recovered) continue;
          return;
        }
      }
    } finally {
      if (pollGeneration === backgroundPollGenerationRef.current) {
        setAwaitingBackgroundRefresh(false);
      }
    }
  }, [loadFeedPage, recoverBrowserSessionIfNeeded]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    loadMoreBlockedRef.current = false;
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
        if (isSocialPlugin(plugin)) {
          const refreshResult = await runtimeRefresh(
            pluginFilterRef.current,
            feedChannel,
            runtimeOptionsForPlugin(plugin),
          );
          feedNextParamsRef.current = refreshResult.next ?? null;
        }
      }
      const itemCount = await loadFeedPage({ offset: 0, append: false });
      if (
        itemCount === 0
        && shouldScheduleBackgroundFeedReload(
          pluginFilterRef.current,
          feedChannel,
          itemCount,
          false,
          pluginsRef.current,
          channelCapabilitiesRef.current,
          searchFilterRef.current.trim(),
          feedListPendingRef.current,
        )
      ) {
        await pollFeedUntilData({
          pluginId: pluginFilterRef.current,
          channelId: channelFilterRef.current,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadPlugins, loadFeedPage, loadChannelCapabilities, pollFeedUntilData]);

  const loadMore = useCallback(async () => {
    if (
      loadingMore
      || loading
      || awaitingBackgroundRefresh
      || !hasMore
      || loadMoreInFlightRef.current
      || loadMoreBlockedRef.current
    ) {
      return;
    }
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    try {
      const added = await loadFeedPage({ offset: articles.length, append: true });
      setError(null);
      if (added > 0) {
        loadMoreBlockedRef.current = false;
      } else if (added === 0) {
        setHasMore(false);
        loadMoreBlockedRef.current = true;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      loadMoreBlockedRef.current = true;
      setHasMore(false);
    } finally {
      loadMoreInFlightRef.current = false;
      setLoadingMore(false);
    }
  }, [articles.length, hasMore, loadFeedPage, loading, loadingMore, awaitingBackgroundRefresh]);

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
    cancelBackgroundFeedPolling();
    feedRequestId.current += 1;
    feedPaginationExhaustedRef.current = false;
    loadMoreBlockedRef.current = false;

    if (isPluginFavoritesChannel(channelFilterRef.current)) {
      feedNextParamsRef.current = null;
      setArticles([]);
      setHasMore(false);
      setFeedTotal(0);
      setLoading(false);
      setSearching(false);
      setError(null);
      return;
    }

    const feedKey = buildFeedKey(
      pluginFilterRef.current,
      channelFilterRef.current,
      contentTypeFilterRef.current,
      searchFilterRef.current,
      pluginGroupScopeIdRef.current,
    );
    const cached = !isSearchReload ? feedCache.get(feedKey) : undefined;
    if (cached) {
      setArticles(cached.articles);
      setHasMore(cached.hasMore);
      setFeedTotal(cached.feedTotal);
      feedNextParamsRef.current = cached.feedNextParams;
      setLoading(false);
      setSearching(false);
    } else {
      feedNextParamsRef.current = null;
      setArticles([]);
      setHasMore(false);
      if (isSearchReload) {
        setSearching(true);
      } else {
        setLoading(true);
      }
    }
    setError(null);
    let deferLoadingClear = false;
    const reloadContext = {
      pluginId: pluginFilterRef.current,
      channelId: channelFilterRef.current,
    };
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
        if (isSocialPlugin(plugin)) {
          const refreshResult = await runtimeRefresh(
            pluginFilterRef.current,
            feedChannel,
            runtimeOptionsForPlugin(plugin),
          );
          feedNextParamsRef.current = refreshResult.next ?? null;
        }
      }
      const itemCount = await loadFeedPage({ offset: 0, append: false });
      deferLoadingClear = itemCount === 0 && shouldScheduleBackgroundFeedReload(
        reloadContext.pluginId,
        feedChannel,
        itemCount,
        false,
        pluginsRef.current,
        channelCapabilitiesRef.current,
        searchFilterRef.current.trim(),
        feedListPendingRef.current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      const clearBusyState = () => {
        if (
          pluginFilterRef.current !== reloadContext.pluginId
          || channelFilterRef.current !== reloadContext.channelId
        ) {
          return;
        }
        commitFeedSettled();
        if (isSearchReload) {
          setSearching(false);
        } else {
          setLoading(false);
        }
      };

      if (deferLoadingClear) {
        void pollFeedUntilData(reloadContext).finally(clearBusyState);
      } else {
        clearBusyState();
      }
    }
  }, [loadFeedPage, loadChannelCapabilities, cancelBackgroundFeedPolling, pollFeedUntilData, commitFeedSettled]);

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
    browserSessionRecoveryAttemptedRef.current = null;
  }, [pluginFilter]);

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
  const prevFeedContextRef = useRef({
    pluginFilter,
    channelFilter,
    contentTypeFilter,
    searchFilter,
    pluginGroupScopeId,
  });
  useLayoutEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      prevSearchFilterRef.current = searchFilter;
      prevFeedContextRef.current = {
        pluginFilter,
        channelFilter,
        contentTypeFilter,
        searchFilter,
        pluginGroupScopeId,
      };
      return;
    }
    const prev = prevFeedContextRef.current;
    const oldFeedKey = buildFeedKey(
      prev.pluginFilter,
      prev.channelFilter,
      prev.contentTypeFilter,
      prev.searchFilter,
      prev.pluginGroupScopeId,
    );
    snapshotCurrentFeed(
      oldFeedKey,
      articlesRef.current,
      hasMoreRef.current,
      feedTotalRef.current,
      feedNextParamsRef.current,
    );
    prevFeedContextRef.current = {
      pluginFilter,
      channelFilter,
      contentTypeFilter,
      searchFilter,
      pluginGroupScopeId,
    };
    const searchChanged = prevSearchFilterRef.current !== searchFilter;
    prevSearchFilterRef.current = searchFilter;
    void reloadFeedOnlyRef.current(searchChanged ? { searching: true } : undefined);
  }, [pluginFilter, channelFilter, contentTypeFilter, searchFilter, pluginGroupScopeId]);

  useEffect(() => {
    const feedKey = buildFeedKey(
      pluginFilter,
      channelFilter,
      contentTypeFilter,
      searchFilter,
      pluginGroupScopeId,
    );
    if (articles.length === 0) return;
    snapshotCurrentFeed(
      feedKey,
      articles,
      hasMore,
      feedTotal,
      feedNextParamsRef.current,
    );
  }, [articles, hasMore, feedTotal, pluginFilter, channelFilter, contentTypeFilter, searchFilter, pluginGroupScopeId]);

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
    async (
      marketId: string,
      contentRating?: import("@/types").MarketPluginContentRating,
    ) => {
      const plugin = await installMarketPlugin(marketId, contentRating);
      await loadPlugins();
      scheduleFeedReloadAfterBackgroundFetch(
        loadFeedPage,
        () => ({
          pluginId: pluginFilterRef.current,
          channelId: channelFilterRef.current,
        }),
        () => feedListPendingRef.current,
        pluginId => recoverBrowserSessionRef.current(pluginId),
      );
      return plugin;
    },
    [loadPlugins, loadFeedPage],
  );

  const updateOfficialPlugin = useCallback(
    async (
      marketId: string,
      pluginId: string,
      contentRating?: import("@/types").MarketPluginContentRating,
    ) => {
      const plugin = await updateMarketPlugin(marketId, pluginId, contentRating);
      await loadPlugins();
      scheduleFeedReloadAfterBackgroundFetch(
        loadFeedPage,
        () => ({
          pluginId: pluginFilterRef.current,
          channelId: channelFilterRef.current,
        }),
        () => feedListPendingRef.current,
        pluginId => recoverBrowserSessionRef.current(pluginId),
      );
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
        void loadFeedPage({ offset: 0, append: false }).catch(console.error);
        if (nextActive) {
          scheduleFeedReloadAfterBackgroundFetch(
            loadFeedPage,
            () => ({
              pluginId: pluginFilterRef.current,
              channelId: channelFilterRef.current,
            }),
            () => feedListPendingRef.current,
            pluginId => recoverBrowserSessionRef.current(pluginId),
          );
        }
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

  const togglePluginIncludeInAll = useCallback(
    async (id: string) => {
      const target = plugins.find(p => p.id === id);
      if (!target) return;
      const currentlyIncluded = resolvePluginIncludeInAll(target);
      const nextIncluded = !currentlyIncluded;
      setPlugins(prev => prev.map(plugin => (
        plugin.id === id ? { ...plugin, includeInAll: nextIncluded } : plugin
      )));
      try {
        await setPluginIncludeInAll(id, nextIncluded);
        if (pluginFilterRef.current === "all") {
          void loadFeedPage({ offset: 0, append: false }).catch(console.error);
        }
      } catch (err) {
        setPlugins(prev => prev.map(plugin => (
          plugin.id === id ? { ...plugin, includeInAll: currentlyIncluded } : plugin
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
      try {
        if (shouldUseRuntimeV2(id, plugin) && feedChannel !== "all") {
          await runtimeRefresh(id, feedChannel, runtimeOptionsForPlugin(plugin));
        } else {
          await refreshPluginWithSession(plugin, () =>
            refreshPluginFeed(id, undefined, { force: true }),
          );
        }
        await loadPlugins();
        await loadFeedPage({ offset: 0, append: false });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [loadPlugins, loadFeedPage],
  );

  const refreshChannelFeed = useCallback(async () => {
    const pluginId = pluginFilterRef.current;
    if (pluginId === "all") return;
    const plugin = pluginsRef.current.find(p => p.id === pluginId);
    const feedChannel = resolveFeedChannelId(
      plugin,
      plugin?.channels,
      channelFilterRef.current,
      pluginId,
    );
    if (feedChannel === "all") return;
    try {
      if (shouldUseRuntimeV2(pluginId, plugin)) {
        await runtimeRefresh(pluginId, feedChannel, runtimeOptionsForPlugin(plugin));
      } else {
        await refreshPluginWithSession(plugin, () =>
          refreshPluginFeed(pluginId, feedChannel),
        );
      }
      await loadFeedPage({ offset: 0, append: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [loadFeedPage]);

  useEffect(() => {
    registerBrowserSessionReadyHandler(async (pluginId) => {
      if (pluginFilterRef.current !== pluginId) return;
      // Wait for acquire() to finish clearing activeSessions so a concurrent
      // refresh does not get blocked by withBrowserSessionRetry.
      for (let i = 0; i < 20 && isPluginSessionActive(pluginId); i += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 50));
      }
      if (pluginFilterRef.current !== pluginId) return;
      console.info("[browser-session] refreshing feed after session ready", pluginId);
      try {
        await refreshChannelFeed();
      } catch (err) {
        console.error("[browser-session] post-ready refresh failed", pluginId, err);
      }
    });
    return () => registerBrowserSessionReadyHandler(null);
  }, [refreshChannelFeed]);

  const clearRefreshChannelFeed = useCallback(async () => {
    const pluginId = pluginFilterRef.current;
    if (pluginId === "all") return;
    const plugin = pluginsRef.current.find(p => p.id === pluginId);
    const feedChannel = resolveFeedChannelId(
      plugin,
      plugin?.channels,
      channelFilterRef.current,
      pluginId,
    );
    if (feedChannel === "all") return;
    try {
      if (shouldUseRuntimeV2(pluginId, plugin)) {
        await runtimeClearRefresh(pluginId, feedChannel, runtimeOptionsForPlugin(plugin));
      } else {
        await refreshPluginWithSession(plugin, () =>
          refreshPluginFeed(pluginId, feedChannel, { force: true }),
        );
      }
      await loadFeedPage({ offset: 0, append: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [loadFeedPage]);

  const persistPluginOrder = useCallback((orderedIds: string[]) => {
    reorderPersistQueue.current = reorderPersistQueue.current
      .then(() => reorderPlugins(orderedIds))
      .catch(err => {
        console.error("failed to persist plugin order:", err);
        void loadPlugins();
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

  const markArticleRead = useCallback(async (target: string | Article) => {
    const context = resolveMarkReadContext(
      target,
      articlesRef.current,
      pluginFilterRef.current,
      channelFilterRef.current,
    );
    if (!context) {
      return;
    }
    const { id, pluginId, channelId } = context;

    let wasUnread = false;
    setArticles(prev => {
      const item = prev.find(article => article.id === id);
      if (!item || item.isRead) return prev;
      wasUnread = true;
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

  const currentFeedKey = buildFeedKey(
    pluginFilter,
    channelFilter,
    contentTypeFilter,
    searchFilter,
    pluginGroupScopeId,
  );
  const isFeedSettled = settledFeedKeyRef.current === currentFeedKey;

  return {
    plugins,
    articles: isFeedSettled ? articles : [],
    unreadTotal,
    feedTotal,
    loading: (loading || awaitingBackgroundRefresh || !isFeedSettled) && !searching,
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
    togglePluginIncludeInAll,
    removePlugin,
    movePlugin,
    reorderPlugins: reorderPluginsByIds,
    forceRefreshPlugin,
    refreshChannelFeed,
    clearRefreshChannelFeed,
  };
}
