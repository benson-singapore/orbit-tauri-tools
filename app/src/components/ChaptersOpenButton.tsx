import { Icon } from "@/components/Icon";
import { isDarkTheme } from "@/lib/themeMode";
import type { ThemeMode } from "@/types";

interface ChaptersOpenButtonProps {
  theme: ThemeMode;
  open?: boolean;
  onClick: () => void;
  className?: string;
}

export function ChaptersOpenButton({
  theme,
  open = false,
  onClick,
  className = "",
}: ChaptersOpenButtonProps) {
  const isDark = isDarkTheme(theme);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors align-middle ${className} ${
        isDark
          ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
          : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
      }`}
      title={open ? "收起选集" : "展开选集"}
    >
      <Icon
        name={open ? "collapse" : "expand"}
        className="w-3.5 h-3.5 scale-x-[-1]"
      />
      <span>{open ? "收起" : "选集"}</span>
    </button>
  );
}
