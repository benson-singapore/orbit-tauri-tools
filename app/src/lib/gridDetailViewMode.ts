const STORAGE_KEY = "orbit.gridDetailViewMode";

export type GridDetailViewMode = "modal" | "page";

type GridDetailViewModeMemory = Record<string, GridDetailViewMode>;

function readMemory(): GridDetailViewModeMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: GridDetailViewModeMemory = {};
    for (const [pluginId, mode] of Object.entries(parsed)) {
      if (
        typeof pluginId === "string"
        && pluginId.length > 0
        && (mode === "modal" || mode === "page")
      ) {
        result[pluginId] = mode;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getStoredGridDetailViewMode(pluginId: string): GridDetailViewMode | null {
  return readMemory()[pluginId] ?? null;
}

export function persistGridDetailViewMode(pluginId: string, mode: GridDetailViewMode): void {
  try {
    const memory = readMemory();
    memory[pluginId] = mode;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / private mode
  }
}
