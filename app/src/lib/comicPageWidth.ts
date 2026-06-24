const STORAGE_KEY = "orbit.comicPageWidth";

export const COMIC_PAGE_WIDTH_DEFAULT = 100;
export const COMIC_PAGE_WIDTH_MIN = 50;
export const COMIC_PAGE_WIDTH_MAX = 150;
export const COMIC_PAGE_WIDTH_STEP = 5;

export function clampComicPageWidth(value: number): number {
  const rounded = Math.round(value / COMIC_PAGE_WIDTH_STEP) * COMIC_PAGE_WIDTH_STEP;
  return Math.min(COMIC_PAGE_WIDTH_MAX, Math.max(COMIC_PAGE_WIDTH_MIN, rounded));
}

export function readStoredComicPageWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return COMIC_PAGE_WIDTH_DEFAULT;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? clampComicPageWidth(parsed) : COMIC_PAGE_WIDTH_DEFAULT;
  } catch {
    return COMIC_PAGE_WIDTH_DEFAULT;
  }
}

export function persistComicPageWidth(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // ignore quota / private mode
  }
}

export function comicPageWidthCssValue(percent: number): string {
  return `${clampComicPageWidth(percent)}%`;
}
