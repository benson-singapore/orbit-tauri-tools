import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isDarkTheme } from "@/lib/themeMode";
import { Icon } from "@/components/Icon";
import type { ThemeMode } from "@/types";

interface ChaptersDrawerProps {
  open: boolean;
  theme: ThemeMode;
  title?: string;
  /** Raise stacking above modals (z-[110]/z-[111]). */
  elevated?: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function ChaptersDrawer({
  open,
  theme,
  title = "选集",
  elevated = false,
  onClose,
  children,
}: ChaptersDrawerProps) {
  const isDark = isDarkTheme(theme);
  const backdropZ = elevated ? "z-[110]" : "z-[80]";
  const asideZ = elevated ? "z-[111]" : "z-[81]";

  useEffect(() => {
    if (!open) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div data-theme={theme} className={isDark ? "dark" : undefined}>
      <button
        type="button"
        className={`orbit-chapters-drawer-backdrop fixed inset-0 ${backdropZ}`}
        aria-label="关闭选集"
        onClick={onClose}
      />
      <aside
        className={`orbit-chapters-drawer fixed right-0 top-0 bottom-0 ${asideZ} flex w-full max-w-sm flex-col border-l`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="orbit-chapters-drawer-header flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold truncate">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="orbit-chapters-drawer-icon-btn p-1.5 rounded-lg"
            title="关闭选集"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
