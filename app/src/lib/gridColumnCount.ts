const STORAGE_KEY = "orbit.gridColumnCount";

export const GRID_COLUMN_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
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

const MIN_CARD_WIDTH_PX = 148;
const COLUMN_GAP_PX = 12;

/** Fit requested column count within available pane width. */
export function resolveEffectiveColumnCount(
  width: number,
  requested: GridColumnCount,
): GridColumnCount {
  if (width <= 0) return GRID_COLUMN_OPTIONS[0];

  const maxFit = Math.max(
    1,
    Math.floor((width + COLUMN_GAP_PX) / (MIN_CARD_WIDTH_PX + COLUMN_GAP_PX)),
  );

  let best: GridColumnCount = GRID_COLUMN_OPTIONS[0];
  for (const option of GRID_COLUMN_OPTIONS) {
    if (option <= requested && option <= maxFit) {
      best = option;
    }
  }
  return best;
}
