import type { ArticleContentTheme, ThemeMode } from "@/types";

const STORAGE_KEY = "orbit.themeMode";

export const THEME_MODE_DEFAULT: ThemeMode = "ocean";

export const THEME_MODE_OPTIONS: ThemeMode[] = [
  "light",
  "midnight",
  "forest",
  "rose",
  "ocean",
  "amber",
  "slate",
  "crimson",
  "sand",
];

const VALID_MODES = new Set<ThemeMode>(THEME_MODE_OPTIONS);

/** Legacy storage values from earlier theme iterations */
const LEGACY_DARK_MODE = "dark";
const REMOVED_PURPLE_MODE = "purple";

export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  light: "浅色",
  midnight: "午夜蓝",
  forest: "墨林",
  rose: "暗玫",
  ocean: "深海",
  amber: "琥珀",
  slate: "石墨",
  crimson: "赤焰",
  sand: "暖沙",
};

/** Titlebar swatch preview — gradient per theme */
export const THEME_SWATCH_GRADIENTS: Record<ThemeMode, string> = {
  light: "linear-gradient(135deg, #ffffff 0%, #eef2ff 52%, #e5e7eb 100%)",
  midnight: "linear-gradient(135deg, #060a14 0%, #3b82f6 52%, #101e38 100%)",
  forest: "linear-gradient(135deg, #061008 0%, #10b981 52%, #122a1e 100%)",
  rose: "linear-gradient(135deg, #12080c 0%, #f43f5e 52%, #2a1220 100%)",
  ocean: "linear-gradient(135deg, #061014 0%, #14b8a6 52%, #102830 100%)",
  amber: "linear-gradient(135deg, #141008 0%, #f59e0b 52%, #2a1e0c 100%)",
  slate: "linear-gradient(135deg, #0a0c10 0%, #64748b 52%, #1a1e26 100%)",
  crimson: "linear-gradient(135deg, #140606 0%, #ef4444 52%, #2a1010 100%)",
  sand: "linear-gradient(135deg, #12100c 0%, #c9a66b 52%, #2a2218 100%)",
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
    if (raw === LEGACY_DARK_MODE || raw === REMOVED_PURPLE_MODE) {
      return THEME_MODE_DEFAULT;
    }
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
