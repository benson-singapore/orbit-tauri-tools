import type { Plugin } from "@/types";

const STORAGE_KEY = "orbit.pluginPreviewMode";

export type PluginPreviewMode = "reader" | "waterfall" | "grid" | "split" | "splitDetail" | "videoWall";

export function defaultPluginPreviewMode(
  plugin?: Pick<Plugin, "mediaType"> | null,
): PluginPreviewMode {
  switch (plugin?.mediaType) {
    case "article":
      return "reader";
    case "image":
      return "waterfall";
    default:
      return "grid";
  }
}

export function resolvePluginPreviewMode(
  plugin: Pick<Plugin, "mediaType"> | undefined | null,
  stored: PluginPreviewMode | null | undefined,
): PluginPreviewMode {
  const mode = stored ?? defaultPluginPreviewMode(plugin);
  if (mode === "waterfall" && plugin?.mediaType !== "image") {
    return defaultPluginPreviewMode(plugin);
  }
  if (mode === "videoWall") {
    return "grid";
  }
  return mode;
}

type PluginPreviewModeMemory = Record<string, PluginPreviewMode>;

function readMemory(): PluginPreviewModeMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: PluginPreviewModeMemory = {};
    for (const [pluginId, mode] of Object.entries(parsed)) {
      if (
        typeof pluginId === "string"
        && pluginId.length > 0
        && (mode === "reader" || mode === "waterfall" || mode === "grid" || mode === "split" || mode === "splitDetail" || mode === "videoWall")
      ) {
        result[pluginId] = mode;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getStoredPluginPreviewMode(
  pluginId: string,
): PluginPreviewMode | null {
  return readMemory()[pluginId] ?? null;
}

export function persistPluginPreviewMode(
  pluginId: string,
  mode: PluginPreviewMode,
): void {
  try {
    const memory = readMemory();
    memory[pluginId] = mode;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / private mode
  }
}

export function clearStoredPluginPreviewMode(pluginId: string): void {
  try {
    const memory = readMemory();
    if (!(pluginId in memory)) return;
    delete memory[pluginId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / private mode
  }
}
