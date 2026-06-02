import { useEffect } from "react";
import { isTauriApp } from "@/lib/uiZoom";

/** Marks document root for overlay titlebar CSS (macOS traffic-light inset, etc.). */
export function useTitlebarEnv() {
  useEffect(() => {
    if (!isTauriApp()) return;

    const root = document.documentElement;
    root.classList.add("orbit-tauri");

    const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
    if (isMac) {
      root.classList.add("orbit-tauri-mac");
    } else {
      root.classList.add("orbit-tauri-non-mac");
    }

    return () => {
      root.classList.remove("orbit-tauri", "orbit-tauri-mac", "orbit-tauri-non-mac");
    };
  }, []);
}
