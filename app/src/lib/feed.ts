import type {
  Article,
  FeedResponse,
  InstallRSSPluginRequest,
  Plugin,
  PluginsResponse,
} from "@/types";
import { getRuntimeBaseUrl, waitForRuntimeReady } from "@/lib/runtime";

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

export async function fetchPlugins(): Promise<Plugin[]> {
  const base = await apiBase();
  const res = await fetch(`${base}/v1/plugins`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as PluginsResponse;
  return data.plugins ?? [];
}

export async function fetchFeed(options?: {
  pluginId?: string;
  refresh?: boolean;
}): Promise<Article[]> {
  const base = await apiBase();
  const params = new URLSearchParams();
  if (options?.pluginId && options.pluginId !== "all") {
    params.set("plugin_id", options.pluginId);
  }
  if (options?.refresh) {
    params.set("refresh", "1");
  }
  const qs = params.toString();
  const res = await fetch(`${base}/v1/feed${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const data = (await res.json()) as FeedResponse;
  return data.items ?? [];
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

export async function isRuntimeAvailable(): Promise<boolean> {
  try {
    const base = await getRuntimeBaseUrl();
    return Boolean(base);
  } catch {
    return false;
  }
}
