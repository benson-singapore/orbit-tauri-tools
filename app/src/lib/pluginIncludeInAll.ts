import type { Plugin } from "@/types";

export function defaultPluginIncludeInAll(
  plugin: Pick<Plugin, "mediaType" | "contentRating">,
): boolean {
  if (plugin.contentRating === "mature") {
    return false;
  }
  return plugin.mediaType === "article";
}

export function resolvePluginIncludeInAll(
  plugin: Pick<Plugin, "includeInAll" | "mediaType" | "contentRating">,
): boolean {
  if (typeof plugin.includeInAll === "boolean") {
    return plugin.includeInAll;
  }
  return defaultPluginIncludeInAll(plugin);
}
