import type { BrowserSessionInfo, BrowserSessionPluginContext } from "@/types";
import { savePluginVariables } from "@/lib/runtimeV2";
import {
  BrowserSessionRequiredError,
  isBrowserSessionRequiredError,
  isLikelyBrowserSessionMessage,
  inferBrowserSessionForPlugin,
} from "@/lib/browserSessionError";
import { requestBrowserSession } from "@/lib/browserSessionGate";
import { isPluginSessionActive } from "@/lib/pluginSession";

export async function withBrowserSessionRetry<T>(
  plugin: BrowserSessionPluginContext | null | undefined,
  action: () => Promise<T>,
  options?: { channelId?: string },
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    let session = resolveBrowserSessionRequest(error, plugin);
    if (!session || isPluginSessionActive(session.pluginId)) {
      throw error;
    }
    if (options?.channelId && plugin?.channels) {
      const channel = plugin.channels.find(item => item.id === options.channelId);
      const startUrl = channel?.params?.url?.trim();
      if (startUrl) {
        session = { ...session, startUrl };
      }
    }
    await savePluginVariables(session.pluginId, { cookie: "", userAgent: "" });
    const values = await requestBrowserSession(session);
    if (!values) {
      throw error;
    }
    await savePluginVariables(session.pluginId, values);
    return await action();
  }
}

export function resolveBrowserSessionRequest(
  error: unknown,
  plugin?: BrowserSessionPluginContext | null,
): BrowserSessionInfo | null {
  if (isBrowserSessionRequiredError(error)) {
    return {
      ...error.session,
      pluginName: error.session.pluginName ?? plugin?.name,
    };
  }
  if (!plugin) return null;
  const message = error instanceof Error ? error.message : String(error);
  if (!isLikelyBrowserSessionMessage(message)) return null;
  return inferBrowserSessionForPlugin(plugin);
}

export { BrowserSessionRequiredError, isBrowserSessionRequiredError };
