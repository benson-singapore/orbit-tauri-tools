import type { ChangeEvent } from "react";
import {
  GRID_COLUMN_OPTIONS,
  type GridColumnCount,
} from "@/lib/gridColumnCount";
import type { ThemeMode } from "@/types";

interface GridColumnSwitcherProps {
  theme: ThemeMode;
  value: GridColumnCount;
  onChange: (count: GridColumnCount) => void;
  label?: string;
}

export function GridColumnSwitcher({
  theme,
  value,
  onChange,
  label = "列数",
}: GridColumnSwitcherProps) {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onChange(Number.parseInt(e.target.value, 10) as GridColumnCount);
  };

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 ${
        theme === "dark" ? "bg-neutral-800/60" : "bg-neutral-100"
      }`}
      title={label}
    >
      <span className="text-[10px] font-medium text-neutral-400 pl-0.5 hidden sm:inline">
        {label}
      </span>
      <div className="relative">
        <select
          value={String(value)}
          onChange={handleChange}
          aria-label={label}
          className={`h-6 pl-1.5 pr-5 rounded-md text-[11px] font-semibold tabular-nums appearance-none cursor-pointer transition-all ${
            theme === "dark"
              ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-600"
              : "bg-white text-neutral-800 hover:bg-neutral-50 shadow-sm"
          }`}
        >
          {GRID_COLUMN_OPTIONS.map(option => (
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
