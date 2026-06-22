import {
  DEFAULT_GRID_COLUMN_COUNT,
  GRID_COLUMN_OPTIONS,
  type GridColumnCount,
} from "@/lib/gridColumnCount";

const STORAGE_KEY = "orbit.pluginVideoWallColumnCount";
const LEGACY_STORAGE_KEY = "orbit.videoWallColumnCount";

export { GRID_COLUMN_OPTIONS, type GridColumnCount, DEFAULT_GRID_COLUMN_COUNT };

export const DEFAULT_VIDEO_WALL_COLUMN_COUNT: GridColumnCount = 2;

type PluginVideoWallColumnMemory = Record<string, GridColumnCount>;

function readMemory(): PluginVideoWallColumnMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: PluginVideoWallColumnMemory = {};
    for (const [pluginId, count] of Object.entries(parsed)) {
      const parsedCount = typeof count === "number" ? count : Number.parseInt(String(count), 10);
      if (
        typeof pluginId === "string"
        && pluginId.length > 0
        && GRID_COLUMN_OPTIONS.includes(parsedCount as GridColumnCount)
      ) {
        result[pluginId] = parsedCount as GridColumnCount;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function readLegacyValue(): GridColumnCount | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    if (GRID_COLUMN_OPTIONS.includes(parsed as GridColumnCount)) {
      return parsed as GridColumnCount;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getStoredVideoWallColumnCount(pluginId: string): GridColumnCount {
  const stored = readMemory()[pluginId];
  if (stored != null) return stored;
  return readLegacyValue() ?? DEFAULT_VIDEO_WALL_COLUMN_COUNT;
}

export function persistVideoWallColumnCount(pluginId: string, count: GridColumnCount): void {
  try {
    const memory = readMemory();
    memory[pluginId] = count;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / private mode
  }
}

/** @deprecated Use getStoredVideoWallColumnCount(pluginId) */
export function readStoredVideoWallColumnCount(): GridColumnCount {
  return readLegacyValue() ?? DEFAULT_VIDEO_WALL_COLUMN_COUNT;
}
