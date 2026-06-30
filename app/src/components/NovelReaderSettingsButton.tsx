import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { isDarkTheme } from "@/lib/themeMode";
import {
  getNovelBackgroundPalette,
  NOVEL_BACKGROUND_OPTIONS,
  NOVEL_BRIGHTNESS_MAX,
  NOVEL_BRIGHTNESS_MIN,
  NOVEL_BRIGHTNESS_STEP,
  NOVEL_CONTENT_WIDTH_MAX,
  NOVEL_CONTENT_WIDTH_MIN,
  NOVEL_CONTENT_WIDTH_STEP,
  NOVEL_FONT_FAMILY_OPTIONS,
  NOVEL_FONT_SCALE_MAX,
  NOVEL_FONT_SCALE_MIN,
  NOVEL_FONT_SCALE_STEP,
  NOVEL_READER_SETTINGS_DEFAULT,
  normalizeNovelReaderSettings,
  type NovelReaderSettings,
} from "@/lib/novelReaderSettings";
import type { ThemeMode } from "@/types";

interface NovelReaderSettingsButtonProps {
  theme: ThemeMode;
  settings: NovelReaderSettings;
  onChange: (settings: NovelReaderSettings) => void;
  className?: string;
  variant?: "default" | "icon";
}

function SettingsSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  isDark,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  isDark: boolean;
}) {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <label className="block space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={isDark ? "text-neutral-400" : "text-neutral-500"}>{label}</span>
        <span className={`tabular-nums font-medium ${isDark ? "text-neutral-200" : "text-neutral-700"}`}>
          {format(value)}
        </span>
      </div>
      <div className="relative h-4 flex items-center">
        <div
          className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full ${
            isDark ? "bg-neutral-700" : "bg-neutral-200"
          }`}
        />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-indigo-500"
          style={{ width: `${percent}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={event => onChange(Number.parseFloat(event.target.value))}
          className="comic-page-width-slider absolute inset-0 w-full h-full cursor-pointer appearance-none bg-transparent"
        />
      </div>
    </label>
  );
}

export function NovelReaderSettingsButton({
  theme,
  settings,
  onChange,
  className = "",
  variant = "default",
}: NovelReaderSettingsButtonProps) {
  const isDark = isDarkTheme(theme);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const update = useCallback(
    (patch: Partial<NovelReaderSettings>) => {
      onChange(normalizeNovelReaderSettings({ ...settings, ...patch }));
    },
    [onChange, settings],
  );

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const reset = () => {
    onChange({ ...NOVEL_READER_SETTINGS_DEFAULT });
  };

  const triggerClass = variant === "icon"
    ? `p-2 rounded-full transition-colors ${className}`
    : `inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors align-middle ${
        isDark
          ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
          : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
      } ${open ? (isDark ? "bg-neutral-800" : "bg-neutral-100") : ""}`;

  return (
    <div className={`relative ${variant === "default" ? className : ""}`} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className={triggerClass}
        title="阅读调教"
        aria-label="阅读调教"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Icon name="sliders" className={variant === "icon" ? "w-4 h-4" : "w-3.5 h-3.5"} />
        {variant === "default" ? <span>调教</span> : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="小说阅读调教"
          className={`absolute right-0 top-full z-50 mt-1.5 w-[min(18rem,calc(100vw-2rem))] rounded-xl border p-3 shadow-lg ${
            isDark
              ? "border-[var(--orbit-border-strong)] orbit-surface-elevated"
              : "border-neutral-200 bg-white"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className={`text-xs font-semibold ${isDark ? "text-neutral-100" : "text-neutral-900"}`}>
                阅读调教
              </p>
              <p className={`text-[10px] ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                仅对小说阅读生效
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
                isDark
                  ? "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                  : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
              }`}
            >
              重置
            </button>
          </div>

          <div className="space-y-3.5">
            <SettingsSlider
              label="字号"
              value={settings.fontScale}
              min={NOVEL_FONT_SCALE_MIN}
              max={NOVEL_FONT_SCALE_MAX}
              step={NOVEL_FONT_SCALE_STEP}
              format={value => `${Math.round(value * 100)}%`}
              onChange={fontScale => update({ fontScale })}
              isDark={isDark}
            />

            <SettingsSlider
              label="正文宽度"
              value={settings.contentWidth}
              min={NOVEL_CONTENT_WIDTH_MIN}
              max={NOVEL_CONTENT_WIDTH_MAX}
              step={NOVEL_CONTENT_WIDTH_STEP}
              format={value => `${value}%`}
              onChange={contentWidth => update({ contentWidth })}
              isDark={isDark}
            />

            <SettingsSlider
              label="亮度"
              value={settings.brightness}
              min={NOVEL_BRIGHTNESS_MIN}
              max={NOVEL_BRIGHTNESS_MAX}
              step={NOVEL_BRIGHTNESS_STEP}
              format={value => `${value}%`}
              onChange={brightness => update({ brightness })}
              isDark={isDark}
            />

            <label className="block space-y-1.5">
              <span className={`text-[11px] ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                字体
              </span>
              <select
                value={settings.fontFamily}
                onChange={event =>
                  update({ fontFamily: event.target.value as NovelReaderSettings["fontFamily"] })
                }
                className={`w-full rounded-lg border px-2.5 py-1.5 text-xs ${
                  isDark
                    ? "border-neutral-700 bg-neutral-900 text-neutral-100"
                    : "border-neutral-200 bg-white text-neutral-800"
                }`}
              >
                {NOVEL_FONT_FAMILY_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className={`text-[11px] ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                背景色
              </span>
              <div className="grid grid-cols-5 gap-1.5">
                {NOVEL_BACKGROUND_OPTIONS.map(option => {
                  const active = settings.background === option.id;
                  const swatch = getNovelBackgroundPalette(option.id).page;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      title={option.label}
                      onClick={() => update({ background: option.id })}
                      className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[9px] leading-tight transition-colors ${
                        active
                          ? "border-indigo-500 text-indigo-600 dark:text-indigo-300"
                          : isDark
                            ? "border-neutral-700 text-neutral-400 hover:border-neutral-600"
                            : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
                      }`}
                    >
                      <span
                        className={`block h-4 w-full rounded border ${
                          option.id === "default"
                            ? isDark
                              ? "border-neutral-600 bg-gradient-to-br from-neutral-800 to-neutral-700"
                              : "border-neutral-300 bg-gradient-to-br from-white to-neutral-100"
                            : "border-black/10"
                        }`}
                        style={option.id === "default" ? undefined : { background: swatch }}
                        aria-hidden
                      />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
