import {
  COMIC_PAGE_WIDTH_MAX,
  COMIC_PAGE_WIDTH_MIN,
  COMIC_PAGE_WIDTH_STEP,
  clampComicPageWidth,
} from "@/lib/comicPageWidth";

const STORAGE_KEY = "orbit.readerContentWidth";

export const READER_CONTENT_WIDTH_DEFAULT = 80;

export const READER_CONTENT_WIDTH_MIN = COMIC_PAGE_WIDTH_MIN;
export const READER_CONTENT_WIDTH_MAX = COMIC_PAGE_WIDTH_MAX;
export const READER_CONTENT_WIDTH_STEP = COMIC_PAGE_WIDTH_STEP;

export function clampReaderContentWidth(value: number): number {
  return clampComicPageWidth(value);
}

export function readStoredReaderContentWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return READER_CONTENT_WIDTH_DEFAULT;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? clampReaderContentWidth(parsed) : READER_CONTENT_WIDTH_DEFAULT;
  } catch {
    return READER_CONTENT_WIDTH_DEFAULT;
  }
}

export function persistReaderContentWidth(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(clampReaderContentWidth(width)));
  } catch {
    // ignore quota / private mode
  }
}

export function readerContentWidthCssValue(percent: number): string {
  return `${clampReaderContentWidth(percent)}%`;
}
