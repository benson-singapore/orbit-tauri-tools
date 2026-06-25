import type { Article, ChannelCapabilities, VariableDefinition } from "@/types";
import { runtimeFetch } from "@/lib/runtimeFetch";
import { waitForRuntimeReady } from "@/lib/runtime";

export interface RuntimeDispatchResult {
  items?: Article[];
  hasMore?: boolean;
  title?: string;
  item?: Article;
  next?: Record<string, string>;
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
  const res = await runtimeFetch(`${base}/v2/runtime/capabilities?${params}`);
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
  const res = await runtimeFetch(`${base}/v2/runtime/items?${params}`);
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
  const res = await runtimeFetch(`${base}/v2/runtime/chapters?${params}`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as RuntimeDispatchResult;
  return {
    ...data,
    items: (data.items ?? []).map(normalizeArticle),
  };
}

const variablesSchemaCache = new Map<string, Record<string, VariableDefinition>>();
const variablesReadyCache = new Map<string, boolean>();

export type RuntimeCallOptions = {
  variablesSchema?: Record<string, VariableDefinition>;
  variablesReady?: boolean;
};

export function invalidatePluginVariablesCache(pluginId: string) {
  variablesSchemaCache.delete(pluginId);
  variablesReadyCache.delete(pluginId);
}

export function markPluginVariablesReady(pluginId: string) {
  variablesReadyCache.set(pluginId, true);
}

export function findMissingRequiredVariables(
  schema: Record<string, VariableDefinition>,
  values: Record<string, string>,
): { key: string; label: string }[] {
  const missing: { key: string; label: string }[] = [];
  for (const [key, def] of Object.entries(schema)) {
    if (!def.required) continue;
    const val = (values[key] ?? "").trim();
    // Non-empty includes masked secrets from GET /variables — means configured.
    if (val) continue;
    if ((def.default ?? "").trim()) continue;
    missing.push({ key, label: def.label || key });
  }
  return missing;
}

export function formatMissingVariablesError(
  missing: { key: string; label: string }[],
): string {
  if (missing.length === 0) return "缺少必要参数";
  return `缺少必要参数：${missing.map(item => item.label).join("、")}`;
}

async function resolveVariablesSchema(
  pluginId: string,
  schema?: Record<string, VariableDefinition>,
): Promise<Record<string, VariableDefinition>> {
  if (schema && Object.keys(schema).length > 0) {
    return schema;
  }
  const cached = variablesSchemaCache.get(pluginId);
  if (cached) {
    return cached;
  }
  const fetched = await fetchVariablesSchema(pluginId);
  variablesSchemaCache.set(pluginId, fetched);
  return fetched;
}

export async function assertPluginVariablesReady(
  pluginId: string,
  schema?: Record<string, VariableDefinition>,
  variablesReady?: boolean,
): Promise<void> {
  if (variablesReady === true || variablesReadyCache.get(pluginId)) {
    variablesReadyCache.set(pluginId, true);
    return;
  }

  const defs = await resolveVariablesSchema(pluginId, schema);
  const hasRequired = Object.values(defs).some(def => def.required);
  if (!hasRequired) {
    variablesReadyCache.set(pluginId, true);
    return;
  }

  const values = await fetchPluginVariables(pluginId);
  const missing = findMissingRequiredVariables(defs, values);
  if (missing.length > 0) {
    throw new Error(formatMissingVariablesError(missing));
  }
  variablesReadyCache.set(pluginId, true);
}


async function runtimePost(
  path: string,
  body: Record<string, string | Record<string, string> | undefined>,
  options?: RuntimeCallOptions,
): Promise<RuntimeDispatchResult> {
  const pluginId = typeof body.pluginId === "string" ? body.pluginId : "";
  if (pluginId) {
    await assertPluginVariablesReady(
      pluginId,
      options?.variablesSchema,
      options?.variablesReady,
    );
  }
  const base = await apiBase();
  const res = await runtimeFetch(`${base}/v2/runtime/${path}`, {
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

export function runtimeRefresh(
  pluginId: string,
  channelId: string,
  options?: RuntimeCallOptions,
) {
  return runtimePost("refresh", { pluginId, channelId }, options);
}

export function runtimeClearRefresh(
  pluginId: string,
  channelId: string,
  options?: RuntimeCallOptions,
) {
  return runtimePost("clear-refresh", { pluginId, channelId }, options);
}

export function runtimeLoadMore(
  pluginId: string,
  channelId: string,
  params?: Record<string, string>,
  options?: RuntimeCallOptions,
) {
  return runtimePost(
    "load-more",
    {
      pluginId,
      channelId,
      ...(params ? { params } : {}),
    },
    options,
  );
}

export function runtimeSearch(
  pluginId: string,
  channelId: string,
  query: string,
  options?: RuntimeCallOptions,
) {
  return runtimePost("search", { pluginId, channelId, query }, options);
}

export function runtimeOpenDetail(
  pluginId: string,
  channelId: string,
  itemId: string,
  options?: RuntimeCallOptions,
) {
  return runtimePost("open-detail", { pluginId, channelId, itemId }, options);
}

export function runtimeOpenChapters(
  pluginId: string,
  channelId: string,
  itemId: string,
  options?: RuntimeCallOptions,
) {
  return runtimePost("open-chapters", { pluginId, channelId, itemId }, options);
}

export function runtimeLoadMoreChapters(
  pluginId: string,
  channelId: string,
  parentItemId: string,
  options?: RuntimeCallOptions,
) {
  return runtimePost(
    "load-more-chapters",
    { pluginId, channelId, itemId: parentItemId },
    options,
  );
}

export function runtimeRefreshChapters(
  pluginId: string,
  channelId: string,
  parentItemId: string,
  options?: RuntimeCallOptions,
) {
  return runtimePost(
    "refresh-chapters",
    { pluginId, channelId, itemId: parentItemId },
    options,
  );
}

export function runtimeClearRefreshChapters(
  pluginId: string,
  channelId: string,
  parentItemId: string,
  options?: RuntimeCallOptions,
) {
  return runtimePost(
    "clear-refresh-chapters",
    { pluginId, channelId, itemId: parentItemId },
    options,
  );
}

export function runtimeOpenChapterDetail(
  pluginId: string,
  channelId: string,
  parentItemId: string,
  chapterItemId: string,
  options?: RuntimeCallOptions,
) {
  return runtimePost(
    "open-chapter-detail",
    {
      pluginId,
      channelId,
      parentItemId,
      chapterItemId,
    },
    options,
  );
}

export async function fetchVariablesSchema(
  pluginId: string,
): Promise<Record<string, VariableDefinition>> {
  const base = await apiBase();
  const res = await runtimeFetch(`${base}/v2/plugins/${encodeURIComponent(pluginId)}/variables/schema`);
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
  const res = await runtimeFetch(`${base}/v2/plugins/${encodeURIComponent(pluginId)}/variables`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as { values?: Record<string, string> };
  return data.values ?? {};
}

/** Matches backend MaskSecretValue output (first 2 + stars + last 2). */
export function isLikelyMaskedSecretValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.includes("****")) return false;
  return /^.{2}\*+.{2}$/.test(trimmed);
}

/** Omit masked secret placeholders so unchanged credentials are not overwritten on save. */
export function filterVariablesForSave(
  values: Record<string, string>,
  schema: Record<string, VariableDefinition>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const def = schema[key];
    const isSecret = def?.secret !== false;
    if (isSecret && isLikelyMaskedSecretValue(value)) continue;
    out[key] = value;
  }
  return out;
}

export async function savePluginVariables(
  pluginId: string,
  values: Record<string, string>,
): Promise<void> {
  const base = await apiBase();
  const res = await runtimeFetch(`${base}/v2/plugins/${encodeURIComponent(pluginId)}/variables`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  invalidatePluginVariablesCache(pluginId);
  markPluginVariablesReady(pluginId);
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

export function channelHasDetailFeature(
  plugin: { channels?: Array<{ id: string; features?: { detail?: { route?: string } } }> } | null | undefined,
  channelId: string,
): boolean {
  if (!channelId || channelId === "all") return false;
  const channel = plugin?.channels?.find(ch => ch.id === channelId);
  return Boolean(channel?.features?.detail?.route?.trim());
}

export function resolveChannelHasDetail(
  plugin: { channels?: Array<{ id: string; features?: { detail?: { route?: string } } }> } | null | undefined,
  channelId: string,
  capabilities: Pick<ChannelCapabilities, "hasDetail">,
): boolean {
  return capabilities.hasDetail || channelHasDetailFeature(plugin, channelId);
}
