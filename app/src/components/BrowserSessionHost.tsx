import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  notifyBrowserSessionReady,
  registerBrowserSessionHandler,
} from "@/lib/browserSessionGate";
import { isTauriRuntime } from "@/lib/appInfo";
import {
  PLUGIN_SESSION_READY_EVENT,
  type PluginSessionCapture,
  persistPluginSessionCapture,
  waitForBrowserSession,
} from "@/lib/pluginSession";

/** Headless handler: opens CF verification webview and resolves when session is captured. */
export function BrowserSessionHost() {
  useEffect(() => {
    registerBrowserSessionHandler(waitForBrowserSession);
    return () => registerBrowserSessionHandler(null);
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<PluginSessionCapture>(PLUGIN_SESSION_READY_EVENT, (event) => {
      const capture = event.payload;
      const session = {
        pluginId: capture.pluginId,
        origins: [] as string[],
        persist: ["cookie", "userAgent"],
      };
      void persistPluginSessionCapture(session, capture)
        .then(saved => {
          if (saved) {
            notifyBrowserSessionReady(capture.pluginId);
          }
        })
        .catch(err => {
          console.error("[browser-session] persist ready event failed", capture.pluginId, err);
        });
    }).then(fn => {
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return null;
}
