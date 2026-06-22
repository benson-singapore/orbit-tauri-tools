import { useEffect, useRef, useState } from "react";
import {
  THEME_MODE_LABELS,
  THEME_MODE_OPTIONS,
  THEME_SWATCH_GRADIENTS,
  applyThemeMode,
  isDarkTheme,
  persistThemeMode,
} from "@/lib/themeMode";
import type { ThemeMode } from "@/types";

type ThemeSwitcherProps = {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
};

function ThemeSwatch({ mode }: { mode: ThemeMode }) {
  return (
    <span
      className="orbit-theme-swatch shrink-0"
      style={{ background: THEME_SWATCH_GRADIENTS[mode] }}
      aria-hidden
    />
  );
}

function ChevronIcon({ open, dark }: { open: boolean; dark: boolean }) {
  return (
    <svg
      className={`h-3 w-3 shrink-0 transition-transform ${
        open ? "rotate-180" : ""
      } ${dark ? "orbit-titlebar-select-chevron" : "text-neutral-400"}`}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M2.5 4.5L6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeSwitcher({ theme, onThemeChange }: ThemeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dark = isDarkTheme(theme);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const chooseTheme = (mode: ThemeMode) => {
    onThemeChange(mode);
    persistThemeMode(mode);
    applyThemeMode(mode);
    setOpen(false);
  };

  const triggerClass = [
    "orbit-theme-trigger",
    dark ? "orbit-theme-trigger-dark" : "orbit-theme-trigger-light",
  ].join(" ");

  return (
    <div ref={rootRef} className="relative shrink-0" aria-label="主题色系">
      <button
        type="button"
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(value => !value)}
      >
        <ThemeSwatch mode={theme} />
        <span className="truncate">{THEME_MODE_LABELS[theme]}</span>
        <ChevronIcon open={open} dark={dark} />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="选择主题色系"
          className={`orbit-theme-menu ${dark ? "orbit-theme-menu-dark" : "orbit-theme-menu-light"}`}
        >
          {THEME_MODE_OPTIONS.map(mode => {
            const selected = mode === theme;
            return (
              <button
                key={mode}
                type="button"
                role="option"
                aria-selected={selected}
                className={`orbit-theme-option ${selected ? "orbit-theme-option--selected" : ""}`}
                onClick={() => chooseTheme(mode)}
              >
                <ThemeSwatch mode={mode} />
                <span className="flex-1 truncate text-left">{THEME_MODE_LABELS[mode]}</span>
                {selected ? (
                  <svg
                    className="h-3 w-3 shrink-0 text-[var(--orbit-accent)]"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M2.5 6.5L5 9l4.5-5.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span className="w-3 shrink-0" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
