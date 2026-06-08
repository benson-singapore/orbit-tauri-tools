const STORAGE_KEY = "orbit.readerFontScale";

export const READER_FONT_SCALE_DEFAULT = 1;
export const READER_FONT_SCALE_MIN = 0.85;
export const READER_FONT_SCALE_MAX = 1.5;
export const READER_FONT_SCALE_STEP = 0.1;

export function clampReaderFontScale(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Math.min(READER_FONT_SCALE_MAX, Math.max(READER_FONT_SCALE_MIN, rounded));
}

export function readStoredReaderFontScale(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return READER_FONT_SCALE_DEFAULT;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? clampReaderFontScale(parsed) : READER_FONT_SCALE_DEFAULT;
  } catch {
    return READER_FONT_SCALE_DEFAULT;
  }
}

export function persistReaderFontScale(scale: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(scale));
  } catch {
    // ignore quota / private mode
  }
}
