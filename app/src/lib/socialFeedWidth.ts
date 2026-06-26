import {
  COMIC_PAGE_WIDTH_MAX,
  COMIC_PAGE_WIDTH_MIN,
  COMIC_PAGE_WIDTH_STEP,
  clampComicPageWidth,
} from "@/lib/comicPageWidth";

const STORAGE_KEY = "orbit.pluginSocialFeedWidth";

export const SOCIAL_FEED_WIDTH_DEFAULT = 70;

export const SOCIAL_FEED_WIDTH_MIN = COMIC_PAGE_WIDTH_MIN;
export const SOCIAL_FEED_WIDTH_MAX = COMIC_PAGE_WIDTH_MAX;
export const SOCIAL_FEED_WIDTH_STEP = COMIC_PAGE_WIDTH_STEP;

type PluginSocialFeedWidthMemory = Record<string, number>;

function readMemory(): PluginSocialFeedWidthMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: PluginSocialFeedWidthMemory = {};
    for (const [pluginId, width] of Object.entries(parsed)) {
      const parsedWidth = typeof width === "number" ? width : Number.parseFloat(String(width));
      if (typeof pluginId === "string" && pluginId.length > 0 && Number.isFinite(parsedWidth)) {
        result[pluginId] = clampSocialFeedWidth(parsedWidth);
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function clampSocialFeedWidth(value: number): number {
  return clampComicPageWidth(value);
}

export function getStoredSocialFeedWidth(pluginId: string): number {
  return readMemory()[pluginId] ?? SOCIAL_FEED_WIDTH_DEFAULT;
}

export function persistSocialFeedWidth(pluginId: string, width: number): void {
  try {
    const memory = readMemory();
    memory[pluginId] = clampSocialFeedWidth(width);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / private mode
  }
}

export function socialFeedWidthCssValue(percent: number): string {
  return `${clampSocialFeedWidth(percent)}%`;
}
