import { useEffect } from "react";
import { registerBrowserSessionHandler } from "@/lib/browserSessionGate";
import { waitForBrowserSession } from "@/lib/pluginSession";

/** Headless handler: opens CF verification webview and resolves when session is captured. */
export function BrowserSessionHost() {
  useEffect(() => {
    registerBrowserSessionHandler(waitForBrowserSession);
    return () => registerBrowserSessionHandler(null);
  }, []);

  return null;
}
