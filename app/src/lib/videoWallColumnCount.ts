import {
  DEFAULT_GRID_COLUMN_COUNT,
  GRID_COLUMN_OPTIONS,
  type GridColumnCount,
} from "@/lib/gridColumnCount";

const STORAGE_KEY = "orbit.videoWallColumnCount";

export { GRID_COLUMN_OPTIONS, type GridColumnCount, DEFAULT_GRID_COLUMN_COUNT };

export const DEFAULT_VIDEO_WALL_COLUMN_COUNT: GridColumnCount = 2;

export function readStoredVideoWallColumnCount(): GridColumnCount {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VIDEO_WALL_COLUMN_COUNT;
    const parsed = Number.parseInt(raw, 10);
    if (GRID_COLUMN_OPTIONS.includes(parsed as GridColumnCount)) {
      return parsed as GridColumnCount;
    }
  } catch {
    // ignore
  }
  return DEFAULT_VIDEO_WALL_COLUMN_COUNT;
}

export function persistVideoWallColumnCount(count: GridColumnCount): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(count));
  } catch {
    // ignore quota / private mode
  }
}
