import type { ArticleContentTheme, ThemeMode } from "@/types";

const STORAGE_KEY = "orbit.themeMode";

export const THEME_MODE_DEFAULT: ThemeMode = "light";

export const THEME_MODE_OPTIONS: ThemeMode[] = [
  "light",
  "purple",
  "midnight",
  "forest",
  "rose",
  "ocean",
];

const VALID_MODES = new Set<ThemeMode>(THEME_MODE_OPTIONS);

/** Legacy storage value from the first dark-theme iteration */
const LEGACY_DARK_MODE = "dark";

export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  light: "浅色",
  purple: "暗紫",
  midnight: "午夜蓝",
  forest: "墨林",
  rose: "暗玫",
  ocean: "深海",
};

/** Titlebar swatch preview — gradient per theme */
export const THEME_SWATCH_GRADIENTS: Record<ThemeMode, string> = {
  light: "linear-gradient(135deg, #ffffff 0%, #eef2ff 52%, #e5e7eb 100%)",
  purple: "linear-gradient(135deg, #0a0612 0%, #7c3aed 52%, #1a0f32 100%)",
  midnight: "linear-gradient(135deg, #060a14 0%, #3b82f6 52%, #101e38 100%)",
  forest: "linear-gradient(135deg, #061008 0%, #10b981 52%, #122a1e 100%)",
  rose: "linear-gradient(135deg, #12080c 0%, #f43f5e 52%, #2a1220 100%)",
  ocean: "linear-gradient(135deg, #061014 0%, #14b8a6 52%, #102830 100%)",
};

export function isDarkTheme(mode: ThemeMode): boolean {
  return mode !== "light";
}

export function articleContentTheme(mode: ThemeMode): ArticleContentTheme {
  return isDarkTheme(mode) ? "dark" : "light";
}

export function readStoredThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === LEGACY_DARK_MODE) return "purple";
    if (raw && VALID_MODES.has(raw as ThemeMode)) {
      return raw as ThemeMode;
    }
  } catch {
    // ignore
  }
  return THEME_MODE_DEFAULT;
}

export function persistThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}

export function applyThemeMode(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  document.documentElement.classList.toggle("dark", isDarkTheme(mode));
}
