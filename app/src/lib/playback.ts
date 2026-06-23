import type { PlaybackRecord } from "@/types";
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

export interface PlaybackListResponse {
  ok: boolean;
  items: PlaybackRecord[];
  total: number;
}

export interface PlaybackGetResponse {
  ok: boolean;
  data: PlaybackRecord | null;
}

export async function listPlayback(
  pluginId: string,
  options?: { limit?: number; offset?: number; channelId?: string },
): Promise<PlaybackListResponse> {
  const base = await apiBase();
  const params = new URLSearchParams({ plugin_id: pluginId });
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset != null) params.set("offset", String(options.offset));
  if (options?.channelId) params.set("channel_id", options.channelId);
  const res = await fetch(`${base}/v1/playback?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as PlaybackListResponse;
}

export async function getPlayback(
  pluginId: string,
  parentId: string,
  channelId?: string,
): Promise<PlaybackRecord | null> {
  const base = await apiBase();
  const params = new URLSearchParams();
  if (channelId) params.set("channel_id", channelId);
  const qs = params.toString();
  const res = await fetch(
    `${base}/v1/playback/${encodeURIComponent(pluginId)}/${encodeURIComponent(parentId)}${qs ? `?${qs}` : ""}`,
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as PlaybackGetResponse;
  return data.data ?? null;
}

export async function putPlayback(pluginId: string, record: PlaybackRecord): Promise<void> {
  const base = await apiBase();
  const res = await fetch(`${base}/v1/playback`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pluginId, record }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function deletePlayback(pluginId: string, parentId: string): Promise<void> {
  const base = await apiBase();
  const res = await fetch(
    `${base}/v1/playback/${encodeURIComponent(pluginId)}/${encodeURIComponent(parentId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function deleteAllPlayback(
  pluginId: string,
  channelId?: string,
): Promise<void> {
  const base = await apiBase();
  const params = new URLSearchParams({ plugin_id: pluginId });
  if (channelId) params.set("channel_id", channelId);
  const res = await fetch(`${base}/v1/playback?${params.toString()}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await parseError(res));
}

/** @deprecated use waitForRuntimeReady via apiBase */
export async function playbackApiBase(): Promise<string> {
  const url = await getRuntimeBaseUrl();
  if (!url) throw new Error("runtime not ready");
  return url.replace(/\/$/, "");
}
