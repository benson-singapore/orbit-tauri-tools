import type { BrowserSessionInfo } from "@/types";

type SessionRequestHandler = (
  session: BrowserSessionInfo,
) => Promise<Record<string, string> | null>;

type SessionReadyHandler = (pluginId: string) => void | Promise<void>;

let handler: SessionRequestHandler | null = null;
let readyHandler: SessionReadyHandler | null = null;
let readyRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let pendingReadyPluginId: string | null = null;

export function registerBrowserSessionHandler(next: SessionRequestHandler | null): void {
  handler = next;
}

export function registerBrowserSessionReadyHandler(next: SessionReadyHandler | null): void {
  readyHandler = next;
  if (!next && readyRefreshTimer) {
    clearTimeout(readyRefreshTimer);
    readyRefreshTimer = null;
    pendingReadyPluginId = null;
  }
}

export async function requestBrowserSession(
  session: BrowserSessionInfo,
): Promise<Record<string, string> | null> {
  if (!handler) return null;
  return handler(session);
}

/** Notify UI that a browser session was captured (debounced per plugin). */
export function notifyBrowserSessionReady(pluginId: string): void {
  pendingReadyPluginId = pluginId;
  if (readyRefreshTimer) {
    clearTimeout(readyRefreshTimer);
  }
  readyRefreshTimer = setTimeout(() => {
    readyRefreshTimer = null;
    const id = pendingReadyPluginId;
    pendingReadyPluginId = null;
    if (!id || !readyHandler) return;
    void Promise.resolve(readyHandler(id)).catch(err => {
      console.error("[browser-session] ready refresh failed", id, err);
    });
  }, 200);
}
