import type {
  Article,
  ContentType,
  FeedItemResponse,
  FeedResponse,
  InstallRSSPluginRequest,
  Plugin,
  PluginsResponse,
} from "@/types";
import { getRuntimeBaseUrl, waitForRuntimeReady } from "@/lib/runtime";

const inFlightGetRequests = new Map<string, Promise<Response>>();

async function apiBase(): Promise<string> {
  const base = await waitForRuntimeReady();
  return base.replace(/\/$/, "");
}

function fetchGetWithDedupe(url: string): Promise<Response> {
  const existing = inFlightGetRequests.get(url);
  if (existing) {
    return existing.then((res) => res.clone());
  }
  const req = fetch(url)
    .then((res) => res.clone())
    .finally(() => {
      inFlightGetRequests.delete(url);
    });
  inFlightGetRequests.set(url, req);
  return req.then((res) => res.clone());
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function normalizeArticle(article: Article): Article {
  return {
    ...article,
    tags: Array.isArray(article.tags) ? article.tags : [],
    isBookmarked: Boolean(article.isBookmarked),
    isRead: Boolean(article.isRead),
  };
}

export async function fetchPlugins(): Promise<Plugin[]> {
  const base = await apiBase();
  const res = await fetchGetWithDedupe(`${base}/v1/plugins`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as PluginsResponse;
  return (data.plugins ?? []).map(plugin => ({
    ...plugin,
    channels: Array.isArray(plugin.channels) ? plugin.channels : [],
  }));
}

export async function fetchFeed(options?: {
  pluginId?: string;
  pluginIds?: string[];
  channel?: string;
  type?: ContentType;
  search?: string;
  refresh?: boolean;
  limit?: number;
  offset?: number;
}): Promise<FeedResponse> {
  const base = await apiBase();
  const params = new URLSearchParams();
  const scopeIds = (options?.pluginIds ?? []).filter(id => id && id !== "all");
  if (scopeIds.length > 0) {
    params.set("plugin_ids", scopeIds.join(","));
  } else if (options?.pluginId && options.pluginId !== "all") {
    params.set("plugin_id", options.pluginId);
  }
  if (options?.channel) {
    params.set("channel", options.channel);
  }
  if (options?.type) {
    params.set("type", options.type);
  }
  if (options?.search?.trim()) {
    params.set("q", options.search.trim());
  }
  if (options?.refresh) {
    params.set("refresh", "1");
  }
  if (options?.limit && options.limit > 0) {
    params.set("limit", String(options.limit));
  }
  if (typeof options?.offset === "number" && options.offset >= 0) {
    params.set("offset", String(options.offset));
  }
  const qs = params.toString();
  const res = await fetchGetWithDedupe(`${base}/v1/feed${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as FeedResponse;
  return {
    ...data,
    items: (data.items ?? []).map(normalizeArticle),
  };
}

export async function fetchFeedUnread(options?: {
  pluginId?: string;
  pluginIds?: string[];
  channel?: string;
  type?: ContentType;
}): Promise<number> {
  const base = await apiBase();
  const params = new URLSearchParams();
  const scopeIds = (options?.pluginIds ?? []).filter(id => id && id !== "all");
  if (scopeIds.length > 0) {
    params.set("plugin_ids", scopeIds.join(","));
  } else if (options?.pluginId && options.pluginId !== "all") {
    params.set("plugin_id", options.pluginId);
  }
  if (options?.channel && options.channel !== "all") {
    params.set("channel", options.channel);
  }
  if (options?.type) {
    params.set("type", options.type);
  }
  const qs = params.toString();
  const res = await fetchGetWithDedupe(`${base}/v1/feed/unread${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as { unreadTotal?: number };
  return data.unreadTotal ?? 0;
}

export async function fetchFeedItem(id: string): Promise<Article> {
  const base = await apiBase();
  const res = await fetchGetWithDedupe(
    `${base}/v1/feed/item?id=${encodeURIComponent(id)}`,
  );
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as FeedItemResponse;
  return normalizeArticle(data.item);
}

export async function fetchMarketPlugins(): Promise<Plugin[]> {
  const base = await apiBase();
  const res = await fetchGetWithDedupe(`${base}/v1/plugins/market`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as PluginsResponse;
  return (data.plugins ?? []).map(plugin => ({
    ...plugin,
    channels: Array.isArray(plugin.channels) ? plugin.channels : [],
  }));
}

export async function installBundledPlugin(id: string): Promise<Plugin> {
  const base = await apiBase();
  const res = await fetch(`${base}/v1/plugins/${encodeURIComponent(id)}/install`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as { plugin: Plugin };
  return data.plugin;
}

export async function installRSSPlugin(
  body: InstallRSSPluginRequest,
): Promise<Plugin> {
  const base = await apiBase();
  const res = await fetch(`${base}/v1/plugins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "rss", ...body }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as { plugin: Plugin };
  return data.plugin;
}

export async function setPluginActive(
  id: string,
  active: boolean,
): Promise<void> {
  const base = await apiBase();
  const res = await fetch(`${base}/v1/plugins/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
}

export async function uninstallPlugin(id: string): Promise<void> {
  const base = await apiBase();
  const res = await fetch(`${base}/v1/plugins/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
}

export async function refreshPluginFeed(
  pluginId: string,
  channel?: string,
  options?: { force?: boolean },
): Promise<void> {
  const base = await apiBase();
  const params = new URLSearchParams({ plugin_id: pluginId });
  if (channel) {
    params.set("channel", channel);
  }
  if (options?.force) {
    params.set("force", "1");
  }
  const res = await fetch(`${base}/v1/feed/refresh?${params}`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
}

export async function markFeedItemRead(id: string): Promise<void> {
  const base = await apiBase();
  const res = await fetch(`${base}/v1/feed/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
}

export async function isRuntimeAvailable(): Promise<boolean> {
  try {
    const base = await getRuntimeBaseUrl();
    return Boolean(base);
  } catch {
    return false;
  }
}
