import type { Article, ChannelCapabilities, VariableDefinition } from "@/types";
import { waitForRuntimeReady } from "@/lib/runtime";

export interface RuntimeDispatchResult {
  items?: Article[];
  hasMore?: boolean;
  title?: string;
  item?: Article;
}

async function apiBase(): Promise<string> {
  const base = await waitForRuntimeReady();
  return base.replace(/\/$/, "");
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

export async function fetchChannelCapabilities(
  pluginId: string,
  channelId: string,
): Promise<ChannelCapabilities> {
  const base = await apiBase();
  const params = new URLSearchParams({ plugin_id: pluginId, channel_id: channelId });
  const res = await fetch(`${base}/v2/runtime/capabilities?${params}`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return (await res.json()) as ChannelCapabilities;
}

export async function fetchRuntimeItems(options: {
  pluginId: string;
  channelId: string;
  limit?: number;
  offset?: number;
}): Promise<RuntimeDispatchResult> {
  const base = await apiBase();
  const params = new URLSearchParams({
    plugin_id: options.pluginId,
    channel_id: options.channelId,
    limit: String(options.limit ?? 20),
    offset: String(options.offset ?? 0),
  });
  const res = await fetch(`${base}/v2/runtime/items?${params}`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as RuntimeDispatchResult;
  return {
    ...data,
    items: (data.items ?? []).map(normalizeArticle),
    item: data.item ? normalizeArticle(data.item) : undefined,
  };
}

export async function fetchRuntimeChapters(options: {
  pluginId: string;
  channelId: string;
  parentId: string;
}): Promise<RuntimeDispatchResult> {
  const base = await apiBase();
  const params = new URLSearchParams({
    plugin_id: options.pluginId,
    channel_id: options.channelId,
    parent_id: options.parentId,
  });
  const res = await fetch(`${base}/v2/runtime/chapters?${params}`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as RuntimeDispatchResult;
  return {
    ...data,
    items: (data.items ?? []).map(normalizeArticle),
  };
}

async function runtimePost(path: string, body: Record<string, string>): Promise<RuntimeDispatchResult> {
  const base = await apiBase();
  const res = await fetch(`${base}/v2/runtime/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as RuntimeDispatchResult;
  return {
    ...data,
    items: (data.items ?? []).map(normalizeArticle),
    item: data.item ? normalizeArticle(data.item) : undefined,
  };
}

export function runtimeRefresh(pluginId: string, channelId: string) {
  return runtimePost("refresh", { pluginId, channelId });
}

export function runtimeLoadMore(pluginId: string, channelId: string) {
  return runtimePost("load-more", { pluginId, channelId });
}

export function runtimeSearch(pluginId: string, channelId: string, query: string) {
  return runtimePost("search", { pluginId, channelId, query });
}

export function runtimeOpenDetail(pluginId: string, channelId: string, itemId: string) {
  return runtimePost("open-detail", { pluginId, channelId, itemId });
}

export function runtimeOpenChapters(pluginId: string, channelId: string, itemId: string) {
  return runtimePost("open-chapters", { pluginId, channelId, itemId });
}

export function runtimeLoadMoreChapters(pluginId: string, channelId: string, parentItemId: string) {
  return runtimePost("load-more-chapters", { pluginId, channelId, itemId: parentItemId });
}

export function runtimeRefreshChapters(pluginId: string, channelId: string, parentItemId: string) {
  return runtimePost("refresh-chapters", { pluginId, channelId, itemId: parentItemId });
}

export function runtimeClearRefreshChapters(pluginId: string, channelId: string, parentItemId: string) {
  return runtimePost("clear-refresh-chapters", { pluginId, channelId, itemId: parentItemId });
}

export function runtimeOpenChapterDetail(
  pluginId: string,
  channelId: string,
  parentItemId: string,
  chapterItemId: string,
) {
  return runtimePost("open-chapter-detail", {
    pluginId,
    channelId,
    parentItemId,
    chapterItemId,
  });
}

export async function fetchVariablesSchema(
  pluginId: string,
): Promise<Record<string, VariableDefinition>> {
  const base = await apiBase();
  const res = await fetch(`${base}/v2/plugins/${encodeURIComponent(pluginId)}/variables/schema`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as { variables?: Record<string, VariableDefinition> };
  return data.variables ?? {};
}

export async function fetchPluginVariables(
  pluginId: string,
): Promise<Record<string, string>> {
  const base = await apiBase();
  const res = await fetch(`${base}/v2/plugins/${encodeURIComponent(pluginId)}/variables`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as { values?: Record<string, string> };
  return data.values ?? {};
}

export async function savePluginVariables(
  pluginId: string,
  values: Record<string, string>,
): Promise<void> {
  const base = await apiBase();
  const res = await fetch(`${base}/v2/plugins/${encodeURIComponent(pluginId)}/variables`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
}

export function isWasmPlugin(plugin?: { source?: string } | null): boolean {
  return plugin?.source === "wasm";
}

export function shouldUseRuntimeV2(
  pluginId: string,
  plugin?: { source?: string } | null,
): boolean {
  return pluginId !== "all" && isWasmPlugin(plugin);
}

export function channelHasChapters(
  plugin: { channels?: Array<{ id: string; features?: { chapters?: { route?: string } } }> } | null | undefined,
  channelId: string,
): boolean {
  const channel = plugin?.channels?.find(ch => ch.id === channelId);
  return Boolean(channel?.features?.chapters?.route);
}
