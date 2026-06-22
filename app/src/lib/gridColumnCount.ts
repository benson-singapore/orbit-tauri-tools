const STORAGE_KEY = "orbit.pluginGridColumnCount";
const LEGACY_STORAGE_KEY = "orbit.gridColumnCount";

export const GRID_COLUMN_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type GridColumnCount = (typeof GRID_COLUMN_OPTIONS)[number];

export const DEFAULT_GRID_COLUMN_COUNT: GridColumnCount = 4;

type PluginGridColumnMemory = Record<string, GridColumnCount>;

function readMemory(): PluginGridColumnMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: PluginGridColumnMemory = {};
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

export function getStoredGridColumnCount(pluginId: string): GridColumnCount {
  const stored = readMemory()[pluginId];
  if (stored != null) return stored;
  return readLegacyValue() ?? DEFAULT_GRID_COLUMN_COUNT;
}

export function persistGridColumnCount(pluginId: string, count: GridColumnCount): void {
  try {
    const memory = readMemory();
    memory[pluginId] = count;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / private mode
  }
}

/** @deprecated Use getStoredGridColumnCount(pluginId) */
export function readStoredGridColumnCount(): GridColumnCount {
  return readLegacyValue() ?? DEFAULT_GRID_COLUMN_COUNT;
}

/** Honor the user-selected column count without clamping to pane width. */
export function resolveEffectiveColumnCount(
  _width: number,
  requested: GridColumnCount,
): GridColumnCount {
  return requested;
}
