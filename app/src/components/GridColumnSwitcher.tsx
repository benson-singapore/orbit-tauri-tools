import {
  GRID_COLUMN_OPTIONS,
  type GridColumnCount,
} from "@/lib/gridColumnCount";
import type { ThemeMode } from "@/types";

interface GridColumnSwitcherProps {
  theme: ThemeMode;
  value: GridColumnCount;
  onChange: (count: GridColumnCount) => void;
}

export function GridColumnSwitcher({
  theme,
  value,
  onChange,
}: GridColumnSwitcherProps) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 ${
        theme === "dark" ? "bg-neutral-800/60" : "bg-neutral-100"
      }`}
      title="列数"
    >
      <span className="text-[10px] font-medium text-neutral-400 pl-0.5 hidden sm:inline">
        列数
      </span>
      <div className="flex items-center gap-0.5">
        {GRID_COLUMN_OPTIONS.map(option => {
          const isActive = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`min-w-[1.75rem] h-6 px-1.5 rounded-md text-[11px] font-semibold tabular-nums transition-all ${
                isActive
                  ? theme === "dark"
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "bg-neutral-900 text-white shadow-sm"
                  : theme === "dark"
                    ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/80"
                    : "text-neutral-500 hover:text-neutral-800 hover:bg-white/80"
              }`}
              aria-pressed={isActive}
              aria-label={`${option} 列`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
