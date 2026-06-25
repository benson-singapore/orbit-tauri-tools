const STORAGE_KEY = "orbit.pluginGridCoverAspectRatio";
const LEGACY_STORAGE_KEY = "orbit.gridCoverAspectRatio";

export const GRID_COVER_ASPECT_OPTIONS = [
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "1:1",
  "21:9",
] as const;

export type GridCoverAspectRatio = (typeof GRID_COVER_ASPECT_OPTIONS)[number];

export const DEFAULT_GRID_COVER_ASPECT_RATIO: GridCoverAspectRatio = "1:1";

const VALID_RATIOS = new Set<string>(GRID_COVER_ASPECT_OPTIONS);

type PluginGridCoverAspectMemory = Record<string, GridCoverAspectRatio>;

function readMemory(): PluginGridCoverAspectMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: PluginGridCoverAspectMemory = {};
    for (const [pluginId, ratio] of Object.entries(parsed)) {
      if (
        typeof pluginId === "string"
        && pluginId.length > 0
        && typeof ratio === "string"
        && VALID_RATIOS.has(ratio)
      ) {
        result[pluginId] = ratio as GridCoverAspectRatio;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function readLegacyValue(): GridCoverAspectRatio | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw && VALID_RATIOS.has(raw)) {
      return raw as GridCoverAspectRatio;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getStoredGridCoverAspectRatio(pluginId: string): GridCoverAspectRatio {
  const stored = readMemory()[pluginId];
  if (stored != null) return stored;
  return readLegacyValue() ?? DEFAULT_GRID_COVER_ASPECT_RATIO;
}

export function persistGridCoverAspectRatio(pluginId: string, ratio: GridCoverAspectRatio): void {
  try {
    const memory = readMemory();
    memory[pluginId] = ratio;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / private mode
  }
}

/** @deprecated Use getStoredGridCoverAspectRatio(pluginId) */
export function readStoredGridCoverAspectRatio(): GridCoverAspectRatio {
  return readLegacyValue() ?? DEFAULT_GRID_COVER_ASPECT_RATIO;
}

/** CSS `aspect-ratio` value, e.g. `16 / 9`. */
export function gridCoverAspectCss(ratio: GridCoverAspectRatio): string {
  const [width, height] = ratio.split(":");
  return `${width} / ${height}`;
}
