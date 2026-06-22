const STORAGE_KEY = "orbit.pluginSplitPaneRatio";
const LEGACY_STORAGE_KEY = "orbit.splitPaneRatio";

export const DEFAULT_SPLIT_PANE_RATIO = 0.45;
export const MIN_SPLIT_PANE_RATIO = 0.22;
export const MAX_SPLIT_PANE_RATIO = 0.78;

type PluginSplitPaneRatioMemory = Record<string, number>;

function readMemory(): PluginSplitPaneRatioMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: PluginSplitPaneRatioMemory = {};
    for (const [pluginId, ratio] of Object.entries(parsed)) {
      const parsedRatio = typeof ratio === "number" ? ratio : Number.parseFloat(String(ratio));
      if (
        typeof pluginId === "string"
        && pluginId.length > 0
        && Number.isFinite(parsedRatio)
        && parsedRatio >= MIN_SPLIT_PANE_RATIO
        && parsedRatio <= MAX_SPLIT_PANE_RATIO
      ) {
        result[pluginId] = parsedRatio;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function readLegacyValue(): number | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed >= MIN_SPLIT_PANE_RATIO && parsed <= MAX_SPLIT_PANE_RATIO) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getStoredSplitPaneRatio(pluginId: string): number {
  const stored = readMemory()[pluginId];
  if (stored != null) return stored;
  return readLegacyValue() ?? DEFAULT_SPLIT_PANE_RATIO;
}

export function persistSplitPaneRatio(pluginId: string, ratio: number): void {
  try {
    const memory = readMemory();
    memory[pluginId] = ratio;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / private mode
  }
}

/** @deprecated Use getStoredSplitPaneRatio(pluginId) */
export function readStoredSplitPaneRatio(): number {
  return readLegacyValue() ?? DEFAULT_SPLIT_PANE_RATIO;
}

export function clampSplitPaneRatio(ratio: number): number {
  return Math.min(MAX_SPLIT_PANE_RATIO, Math.max(MIN_SPLIT_PANE_RATIO, ratio));
}
