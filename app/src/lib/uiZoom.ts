const STORAGE_KEY = "orbit.uiZoom";
export const UI_ZOOM_DEFAULT = 0.9;
export const UI_ZOOM_MIN = 0.75;
export const UI_ZOOM_MAX = 1.75;
export const UI_ZOOM_STEP = 0.1;

export function isTauriApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function clampUiZoom(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, rounded));
}

export function readStoredUiZoom(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return UI_ZOOM_DEFAULT;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? clampUiZoom(parsed) : UI_ZOOM_DEFAULT;
  } catch {
    return UI_ZOOM_DEFAULT;
  }
}

function persistUiZoom(scale: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(scale));
  } catch {
    // ignore quota / private mode
  }
}

async function applyWebZoom(scale: number): Promise<void> {
  document.documentElement.style.zoom = String(scale);
}

export async function applyUiZoom(scale: number): Promise<number> {
  const clamped = clampUiZoom(scale);
  if (isTauriApp()) {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    await getCurrentWebview().setZoom(clamped);
  } else {
    await applyWebZoom(clamped);
  }
  persistUiZoom(clamped);
  return clamped;
}

export function isUiZoomShortcut(event: KeyboardEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  return (
    event.key === "-" ||
    event.key === "_" ||
    event.key === "+" ||
    event.key === "=" ||
    event.key === "0"
  );
}

export function uiZoomActionFromKeyboard(
  event: KeyboardEvent,
): "in" | "out" | "reset" | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  if (event.key === "-" || event.key === "_") return "out";
  if (event.key === "+" || event.key === "=") return "in";
  if (event.key === "0") return "reset";
  return null;
}
