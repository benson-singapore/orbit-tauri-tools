import { useCallback } from "react";
import { isTauriApp } from "@/lib/uiZoom";

/** Fallback drag handler when overlay titlebar + zoom affect data-tauri-drag-region hit-testing. */
export function useTitlebarDrag() {
  return useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;

    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, [data-tauri-drag-region-exclude]")) {
      return;
    }

    if (!isTauriApp()) return;

    event.preventDefault();
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      void getCurrentWindow().startDragging();
    });
  }, []);
}
