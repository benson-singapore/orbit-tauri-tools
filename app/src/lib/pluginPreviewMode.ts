import type { Plugin } from "@/types";

const STORAGE_KEY = "orbit.pluginPreviewMode";

export type PluginPreviewMode =
  | "reader"
  | "waterfall"
  | "grid"
  | "split"
  | "splitDetail"
  | "videoWall"
  | "socialFeed"
  | "audioFocus";

export function defaultPluginPreviewMode(
  plugin?: Pick<Plugin, "mediaType"> | null,
): PluginPreviewMode {
  switch (plugin?.mediaType) {
    case "article":
      return "reader";
    case "image":
      return "waterfall";
    case "social":
      return "socialFeed";
    case "audio":
      return "audioFocus";
    default:
      return "grid";
  }
}

export function isPreviewModeAllowedForPlugin(
  mode: PluginPreviewMode,
  plugin?: Pick<Plugin, "mediaType"> | null,
): boolean {
  if (mode === "waterfall") {
    return plugin?.mediaType === "image";
  }
  if (mode === "socialFeed") {
    return plugin?.mediaType === "social";
  }
  if (mode === "audioFocus") {
    return plugin?.mediaType === "audio";
  }
  return true;
}

export function resolvePluginPreviewMode(
  plugin: Pick<Plugin, "mediaType"> | undefined | null,
  stored: PluginPreviewMode | null | undefined,
): PluginPreviewMode {
  const mode = stored ?? defaultPluginPreviewMode(plugin);
  if (!isPreviewModeAllowedForPlugin(mode, plugin)) {
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
        && (
          mode === "reader"
          || mode === "waterfall"
          || mode === "grid"
          || mode === "split"
          || mode === "splitDetail"
          || mode === "videoWall"
          || mode === "socialFeed"
          || mode === "audioFocus"
        )
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
