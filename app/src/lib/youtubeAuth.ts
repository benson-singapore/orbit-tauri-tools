import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/appInfo";

export const YOUTUBE_LOGIN_DONE_EVENT = "youtube-login-closed";
const YOUTUBE_AUTH_STORAGE_KEY = "orbit.youtube.authenticated";

export function isYouTubeAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(YOUTUBE_AUTH_STORAGE_KEY) === "1";
}

export function markYouTubeAuthenticated(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(YOUTUBE_AUTH_STORAGE_KEY, "1");
}

export async function openYouTubeLoginWindow(): Promise<boolean> {
  if (!isTauriRuntime()) {
    window.open("https://www.youtube.com/signin", "_blank", "noopener,noreferrer");
    return false;
  }

  await invoke("open_youtube_login_window");
  return true;
}

export function listenYouTubeLoginDone(onDone: () => void): () => void {
  let disposed = false;
  let unlisten: (() => void) | undefined;

  void listen(YOUTUBE_LOGIN_DONE_EVENT, () => {
    if (disposed) return;
    markYouTubeAuthenticated();
    onDone();
  }).then(fn => {
    unlisten = fn;
    if (disposed) {
      void fn();
    }
  });

  return () => {
    disposed = true;
    unlisten?.();
  };
}
