import type { CSSProperties } from "react";

const STORAGE_KEY = "orbit.novelReaderSettings";

export const NOVEL_FONT_SCALE_DEFAULT = 1;
export const NOVEL_FONT_SCALE_MIN = 0.85;
export const NOVEL_FONT_SCALE_MAX = 1.6;
export const NOVEL_FONT_SCALE_STEP = 0.05;

export const NOVEL_CONTENT_WIDTH_DEFAULT = 90;
export const NOVEL_CONTENT_WIDTH_MIN = 45;
export const NOVEL_CONTENT_WIDTH_MAX = 100;
export const NOVEL_CONTENT_WIDTH_STEP = 5;

export const NOVEL_BRIGHTNESS_DEFAULT = 100;
export const NOVEL_BRIGHTNESS_MIN = 80;
export const NOVEL_BRIGHTNESS_MAX = 120;
export const NOVEL_BRIGHTNESS_STEP = 5;

export type NovelReaderFontFamily = "default" | "serif" | "song" | "kai" | "sans";

export type NovelReaderBackground =
  | "default"
  | "sepia"
  | "warm"
  | "green"
  | "slate";

export interface NovelReaderSettings {
  fontScale: number;
  contentWidth: number;
  fontFamily: NovelReaderFontFamily;
  background: NovelReaderBackground;
  brightness: number;
}

export const NOVEL_FONT_FAMILY_OPTIONS: Array<{
  id: NovelReaderFontFamily;
  label: string;
}> = [
  { id: "default", label: "系统默认" },
  { id: "serif", label: "衬线" },
  { id: "song", label: "宋体" },
  { id: "kai", label: "楷体" },
  { id: "sans", label: "黑体" },
];

export const NOVEL_BACKGROUND_OPTIONS: Array<{
  id: NovelReaderBackground;
  label: string;
}> = [
  { id: "default", label: "跟随主题" },
  { id: "sepia", label: "羊皮纸" },
  { id: "warm", label: "暖黄" },
  { id: "green", label: "护眼绿" },
  { id: "slate", label: "深灰" },
];

const NOVEL_FONT_FAMILIES: Record<NovelReaderFontFamily, string> = {
  default: "inherit",
  serif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
  song: '"Songti SC", "SimSun", "STSong", serif',
  kai: '"Kaiti SC", "KaiTi", "STKaiti", serif',
  sans: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
};

export interface NovelBackgroundPalette {
  page: string;
  text: string;
  title: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  muted: string;
  accent: string;
  accentSoft: string;
  tag: string;
  navActive: string;
}

const NOVEL_BACKGROUND_PRESETS: Record<NovelReaderBackground, NovelBackgroundPalette> = {
  default: {
    page: "transparent",
    text: "inherit",
    title: "inherit",
    surface: "transparent",
    surfaceAlt: "transparent",
    border: "transparent",
    muted: "inherit",
    accent: "inherit",
    accentSoft: "transparent",
    tag: "transparent",
    navActive: "transparent",
  },
  sepia: {
    page: "#f4ecd8",
    text: "#433422",
    title: "#2a1f14",
    surface: "#faf6ee",
    surfaceAlt: "#fffdf8",
    border: "#dccfb8",
    muted: "#7a6b58",
    accent: "#8b6914",
    accentSoft: "#ede4d0",
    tag: "#e8dcc8",
    navActive: "#e8dcc8",
  },
  warm: {
    page: "#faf3e8",
    text: "#4a3f35",
    title: "#2f261f",
    surface: "#fff9f0",
    surfaceAlt: "#ffffff",
    border: "#e8dcc8",
    muted: "#7a6e62",
    accent: "#a67c52",
    accentSoft: "#f3e8d8",
    tag: "#f0e4d4",
    navActive: "#f0e4d4",
  },
  green: {
    page: "#e8f0e4",
    text: "#2f3d2c",
    title: "#1f2a1d",
    surface: "#f0f5ed",
    surfaceAlt: "#f8faf7",
    border: "#c8d4c4",
    muted: "#5a6b58",
    accent: "#4a7c59",
    accentSoft: "#dce8d8",
    tag: "#d8e4d4",
    navActive: "#d8e4d4",
  },
  slate: {
    page: "#1c1f24",
    text: "#d1d5db",
    title: "#f3f4f6",
    surface: "#252930",
    surfaceAlt: "#2a2f38",
    border: "#3d4450",
    muted: "#9ca3af",
    accent: "#a5b4fc",
    accentSoft: "rgba(99, 102, 241, 0.16)",
    tag: "#323842",
    navActive: "rgba(99, 102, 241, 0.22)",
  },
};

export function getNovelBackgroundPalette(background: NovelReaderBackground): NovelBackgroundPalette {
  return NOVEL_BACKGROUND_PRESETS[background];
}

export function isNovelBackgroundTuned(background: NovelReaderBackground): boolean {
  return background !== "default";
}

export const NOVEL_READER_SETTINGS_DEFAULT: NovelReaderSettings = {
  fontScale: NOVEL_FONT_SCALE_DEFAULT,
  contentWidth: NOVEL_CONTENT_WIDTH_DEFAULT,
  fontFamily: "default",
  background: "default",
  brightness: NOVEL_BRIGHTNESS_DEFAULT,
};

function clampFontScale(value: number): number {
  const rounded = Math.round(value / NOVEL_FONT_SCALE_STEP) * NOVEL_FONT_SCALE_STEP;
  return Math.min(NOVEL_FONT_SCALE_MAX, Math.max(NOVEL_FONT_SCALE_MIN, rounded));
}

function clampContentWidth(value: number): number {
  const rounded = Math.round(value / NOVEL_CONTENT_WIDTH_STEP) * NOVEL_CONTENT_WIDTH_STEP;
  return Math.min(NOVEL_CONTENT_WIDTH_MAX, Math.max(NOVEL_CONTENT_WIDTH_MIN, rounded));
}

function clampBrightness(value: number): number {
  const rounded = Math.round(value / NOVEL_BRIGHTNESS_STEP) * NOVEL_BRIGHTNESS_STEP;
  return Math.min(NOVEL_BRIGHTNESS_MAX, Math.max(NOVEL_BRIGHTNESS_MIN, rounded));
}

function isFontFamily(value: string): value is NovelReaderFontFamily {
  return NOVEL_FONT_FAMILY_OPTIONS.some(option => option.id === value);
}

function isBackground(value: string): value is NovelReaderBackground {
  return NOVEL_BACKGROUND_OPTIONS.some(option => option.id === value);
}

export function normalizeNovelReaderSettings(
  partial?: Partial<NovelReaderSettings>,
): NovelReaderSettings {
  return {
    fontScale: clampFontScale(partial?.fontScale ?? NOVEL_FONT_SCALE_DEFAULT),
    contentWidth: clampContentWidth(partial?.contentWidth ?? NOVEL_CONTENT_WIDTH_DEFAULT),
    fontFamily: partial?.fontFamily && isFontFamily(partial.fontFamily)
      ? partial.fontFamily
      : "default",
    background: partial?.background && isBackground(partial.background)
      ? partial.background
      : "default",
    brightness: clampBrightness(partial?.brightness ?? NOVEL_BRIGHTNESS_DEFAULT),
  };
}

export function readStoredNovelReaderSettings(): NovelReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...NOVEL_READER_SETTINGS_DEFAULT };
    const parsed = JSON.parse(raw) as Partial<NovelReaderSettings>;
    return normalizeNovelReaderSettings(parsed);
  } catch {
    return { ...NOVEL_READER_SETTINGS_DEFAULT };
  }
}

export function persistNovelReaderSettings(settings: NovelReaderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeNovelReaderSettings(settings)));
  } catch {
    // ignore quota / private mode
  }
}

export function novelReaderSettingsToStyle(
  settings: NovelReaderSettings,
): CSSProperties {
  const normalized = normalizeNovelReaderSettings(settings);
  const palette = NOVEL_BACKGROUND_PRESETS[normalized.background];

  return {
    "--novel-font-scale": normalized.fontScale,
    "--novel-content-width": `${normalized.contentWidth}%`,
    "--novel-font-family": NOVEL_FONT_FAMILIES[normalized.fontFamily],
    "--novel-page-bg": palette.page,
    "--novel-text-color": palette.text,
    "--novel-title-color": palette.title,
    "--novel-surface-bg": palette.surface,
    "--novel-surface-alt-bg": palette.surfaceAlt,
    "--novel-border-color": palette.border,
    "--novel-muted-color": palette.muted,
    "--novel-accent-color": palette.accent,
    "--novel-accent-soft-bg": palette.accentSoft,
    "--novel-tag-bg": palette.tag,
    "--novel-nav-active-bg": palette.navActive,
    "--novel-brightness": String(normalized.brightness / 100),
  } as CSSProperties;
}
