const STORAGE_KEY = "orbit.gridColumnCount";

export const GRID_COLUMN_OPTIONS = [2, 4, 6, 8] as const;
export type GridColumnCount = (typeof GRID_COLUMN_OPTIONS)[number];

export const DEFAULT_GRID_COLUMN_COUNT: GridColumnCount = 4;

export function readStoredGridColumnCount(): GridColumnCount {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GRID_COLUMN_COUNT;
    const parsed = Number.parseInt(raw, 10);
    if (GRID_COLUMN_OPTIONS.includes(parsed as GridColumnCount)) {
      return parsed as GridColumnCount;
    }
  } catch {
    // ignore
  }
  return DEFAULT_GRID_COLUMN_COUNT;
}

export function persistGridColumnCount(count: GridColumnCount): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(count));
  } catch {
    // ignore quota / private mode
  }
}
