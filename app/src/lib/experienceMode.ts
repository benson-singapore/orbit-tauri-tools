import type { PluginSidebarGroup } from "@/lib/pluginGroups";
import type { Plugin } from "@/types";

const STORAGE_KEY = "orbit.experienceMode";

export type ExperienceMode = "safe" | "full";

export const EXPERIENCE_MODE_DEFAULT: ExperienceMode = "safe";

const VALID_MODES = new Set<ExperienceMode>(["safe", "full"]);

export const EXPERIENCE_MODE_LABELS: Record<ExperienceMode, string> = {
  safe: "安全级",
  full: "完整级",
};

export function readStoredExperienceMode(): ExperienceMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_MODES.has(raw as ExperienceMode)) {
      return raw as ExperienceMode;
    }
  } catch {
    // ignore
  }
  return EXPERIENCE_MODE_DEFAULT;
}

export function persistExperienceMode(mode: ExperienceMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}

export function isMaturePlugin(plugin: Pick<Plugin, "contentRating">): boolean {
  return plugin.contentRating === "mature";
}

export function filterPluginsForExperienceMode(
  plugins: Plugin[],
  mode: ExperienceMode,
): Plugin[] {
  if (mode === "full") return plugins;
  return plugins.filter(plugin => plugin.id === "all" || !isMaturePlugin(plugin));
}

export function filterGroupedPluginsForExperienceMode(
  groups: { group: PluginSidebarGroup; plugins: Plugin[] }[],
  mode: ExperienceMode,
): { group: PluginSidebarGroup; plugins: Plugin[] }[] {
  if (mode === "full") return groups;
  return groups
    .map(({ group, plugins }) => ({
      group,
      plugins: plugins.filter(plugin => !isMaturePlugin(plugin)),
    }))
    .filter(entry => entry.plugins.length > 0);
}
