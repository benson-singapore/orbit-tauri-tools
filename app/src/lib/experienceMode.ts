import type { PluginSidebarGroup } from "@/lib/pluginGroups";
import type { Plugin } from "@/types";

const STORAGE_KEY = "orbit.experienceMode";

export type ExperienceMode = "safe" | "full";

const FULL_EXPERIENCE_ENV = String(import.meta.env.VITE_ORBIT_ENABLE_FULL_EXPERIENCE ?? "")
  .trim()
  .toLowerCase();

export const FULL_EXPERIENCE_ENABLED =
  FULL_EXPERIENCE_ENV === "1" || FULL_EXPERIENCE_ENV === "true" || FULL_EXPERIENCE_ENV === "yes";

export const AVAILABLE_EXPERIENCE_MODES: ExperienceMode[] = FULL_EXPERIENCE_ENABLED
  ? ["safe", "full"]
  : ["safe"];

export const EXPERIENCE_MODE_DEFAULT: ExperienceMode = "safe";

const VALID_MODES = new Set<ExperienceMode>(AVAILABLE_EXPERIENCE_MODES);

export const EXPERIENCE_MODE_LABELS: Record<ExperienceMode, string> = {
  safe: "安全级",
  full: "完整级",
};

export const EXPERIENCE_MODE_UNLOCK_PASSWORD = "0000";

export const EXPERIENCE_MODE_SHORTCUT_LABEL = "⌘⇧L";

export function isExperienceModeShortcut(event: KeyboardEvent): boolean {
  return event.metaKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === "l";
}

export function verifyExperienceModePassword(password: string): boolean {
  return password.trim() === EXPERIENCE_MODE_UNLOCK_PASSWORD;
}

export function normalizeExperienceMode(mode: ExperienceMode): ExperienceMode {
  if (mode === "full" && !FULL_EXPERIENCE_ENABLED) {
    return "safe";
  }
  return mode;
}

export function readStoredExperienceMode(): ExperienceMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_MODES.has(raw as ExperienceMode)) {
      return normalizeExperienceMode(raw as ExperienceMode);
    }
  } catch {
    // ignore
  }
  return EXPERIENCE_MODE_DEFAULT;
}

export function persistExperienceMode(mode: ExperienceMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeExperienceMode(mode));
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
