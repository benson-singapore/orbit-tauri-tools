import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/appInfo";
import type { BrowserSessionInfo } from "@/types";
import { sessionOrigin } from "@/lib/browserSessionError";

export const PLUGIN_SESSION_READY_EVENT = "plugin-session-ready";
export const PLUGIN_SESSION_CLOSED_EVENT = "plugin-session-closed";

export interface PluginSessionCapture {
  pluginId: string;
  cookie: string;
  userAgent: string;
}

const activeSessions = new Set<string>();

export function isPluginSessionActive(pluginId: string): boolean {
  return activeSessions.has(pluginId);
}

export function captureToSessionValues(
  session: BrowserSessionInfo,
  capture: PluginSessionCapture,
): Record<string, string> {
  const values: Record<string, string> = {};
  const persist = session.persist.length ? session.persist : ["cookie", "userAgent"];
  const hasCfClearance = capture.cookie
    .split(";")
    .some(part => part.trim().toLowerCase().startsWith("cf_clearance="));
  if (
    persist.includes("cookie") &&
    capture.cookie.trim() &&
    (session.pluginId !== "gequbao" || hasCfClearance)
  ) {
    values.cookie = capture.cookie;
  }
  if (persist.includes("userAgent") && capture.userAgent.trim()) {
    values.userAgent = capture.userAgent;
  }
  return values;
}

/** Open verification webview, wait for session capture, return values to save. */
export async function waitForBrowserSession(
  session: BrowserSessionInfo,
): Promise<Record<string, string> | null> {
  const origin = sessionOrigin(session);
  if (!origin) return null;

  if (!isTauriRuntime()) {
    window.open(session.startUrl ?? origin, "_blank", "noopener,noreferrer");
    return null;
  }

  activeSessions.add(session.pluginId);
  try {
    const capture = await invoke<PluginSessionCapture>("acquire_plugin_session", {
      pluginId: session.pluginId,
      url: session.startUrl ?? origin,
    });
    const values = captureToSessionValues(session, capture);
    console.info("[browser-session] captured", {
      pluginId: session.pluginId,
      cookieLen: capture.cookie.length,
      cookieNames: capture.cookie
        .split(";")
        .map(part => part.split("=")[0]?.trim())
        .filter(Boolean),
      userAgentLen: capture.userAgent.length,
      savedKeys: Object.keys(values),
    });
    return Object.keys(values).length > 0 ? values : null;
  } catch (err) {
    console.error("[browser-session] acquire failed", session.pluginId, err);
    return null;
  } finally {
    activeSessions.delete(session.pluginId);
  }
}

export async function closePluginSessionWindow(pluginId: string): Promise<void> {
  activeSessions.delete(pluginId);
  if (!isTauriRuntime()) return;
  await invoke("close_plugin_session_window", { pluginId });
}
