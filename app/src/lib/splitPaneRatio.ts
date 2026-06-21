const STORAGE_KEY = "orbit.splitPaneRatio";

export const DEFAULT_SPLIT_PANE_RATIO = 0.45;
export const MIN_SPLIT_PANE_RATIO = 0.22;
export const MAX_SPLIT_PANE_RATIO = 0.78;

export function readStoredSplitPaneRatio(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SPLIT_PANE_RATIO;
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed >= MIN_SPLIT_PANE_RATIO && parsed <= MAX_SPLIT_PANE_RATIO) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_SPLIT_PANE_RATIO;
}

export function persistSplitPaneRatio(ratio: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(ratio));
  } catch {
    // ignore quota / private mode
  }
}

export function clampSplitPaneRatio(ratio: number): number {
  return Math.min(MAX_SPLIT_PANE_RATIO, Math.max(MIN_SPLIT_PANE_RATIO, ratio));
}
