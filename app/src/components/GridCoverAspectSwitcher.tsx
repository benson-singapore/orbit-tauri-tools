import type { ChangeEvent } from "react";
import { isDarkTheme } from "@/lib/themeMode";
import {
  GRID_COVER_ASPECT_OPTIONS,
  type GridCoverAspectRatio,
} from "@/lib/gridCoverAspectRatio";
import type { ThemeMode } from "@/types";

interface GridCoverAspectSwitcherProps {
  theme: ThemeMode;
  value: GridCoverAspectRatio;
  onChange: (ratio: GridCoverAspectRatio) => void;
  label?: string;
}

export function GridCoverAspectSwitcher({
  theme,
  value,
  onChange,
  label = "比例",
}: GridCoverAspectSwitcherProps) {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value as GridCoverAspectRatio);
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
          {GRID_COVER_ASPECT_OPTIONS.map(option => (
            <option key={option} value={option}>
              {option}
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
