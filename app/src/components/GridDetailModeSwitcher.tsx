import type { ChangeEvent } from "react";
import { isDarkTheme } from "@/lib/themeMode";
import type { GridDetailViewMode } from "@/lib/gridDetailViewMode";
import type { ThemeMode } from "@/types";

interface GridDetailModeSwitcherProps {
  theme: ThemeMode;
  value: GridDetailViewMode;
  onChange: (mode: GridDetailViewMode) => void;
  label?: string;
}

const GRID_DETAIL_MODE_OPTIONS: Array<{ value: GridDetailViewMode; label: string }> = [
  { value: "modal", label: "弹窗" },
  { value: "page", label: "页面" },
];

export function GridDetailModeSwitcher({
  theme,
  value,
  onChange,
  label = "模式",
}: GridDetailModeSwitcherProps) {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value as GridDetailViewMode);
  };

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 ${
        isDarkTheme(theme) ? "bg-neutral-800/60" : "bg-neutral-100"
      }`}
      title={label}
    >
      <span className="text-[10px] font-medium text-neutral-400 pl-0.5 hidden sm:inline">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={handleChange}
          aria-label={label}
          className={`h-6 pl-1.5 pr-5 rounded-md text-[11px] font-semibold tabular-nums appearance-none cursor-pointer transition-all ${
            isDarkTheme(theme)
              ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-600"
              : "bg-white text-neutral-800 hover:bg-neutral-50 shadow-sm"
          }`}
        >
          {GRID_DETAIL_MODE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span
          className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-neutral-400"
          aria-hidden
        >
          ▾
        </span>
      </div>
    </div>
  );
}
