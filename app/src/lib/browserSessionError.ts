import type {
  BrowserConfig,
  BrowserSessionInfo,
  BrowserSessionPluginContext,
} from "@/types";

export const BROWSER_SESSION_ERROR_CODE = "browser_session_required";

export class BrowserSessionRequiredError extends Error {
  readonly code = BROWSER_SESSION_ERROR_CODE;
  readonly session: BrowserSessionInfo;

  constructor(message: string, session: BrowserSessionInfo) {
    super(message);
    this.name = "BrowserSessionRequiredError";
    this.session = session;
  }
}

export function isBrowserSessionRequiredError(
  error: unknown,
): error is BrowserSessionRequiredError {
  return error instanceof BrowserSessionRequiredError;
}

export function pluginHasBrowserSession(plugin?: {
  browser?: BrowserConfig | null;
}): boolean {
  const browser = plugin?.browser;
  return browser?.purpose === "session" && Boolean(browser.origins?.length);
}

export function sessionOrigin(session: BrowserSessionInfo): string {
  return session.origins[0] ?? "";
}

export async function parseRuntimeErrorResponse(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as {
      error?: string;
      code?: string;
      browserSession?: BrowserSessionInfo;
    };
    const message = body.error ?? `HTTP ${res.status}`;
    if (body.code === BROWSER_SESSION_ERROR_CODE && body.browserSession) {
      return new BrowserSessionRequiredError(message, body.browserSession);
    }
    return new Error(message);
  } catch {
    return new Error(`HTTP ${res.status}`);
  }
}

export function isLikelyBrowserSessionMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.startsWith("captcha:")
    || lower.includes("cloudflare")
    || lower.includes("403")
  );
}

export function browserSessionFromPlugin(
  plugin: { id: string; name?: string; browser?: BrowserConfig | null },
): BrowserSessionInfo | null {
  if (!pluginHasBrowserSession(plugin)) return null;
  const browser = plugin.browser!;
  return {
    pluginId: plugin.id,
    pluginName: plugin.name,
    origins: browser.origins ?? [],
    persist: browser.persist?.length ? browser.persist : ["cookie", "userAgent"],
  };
}

/** Fallback when manifest browser config was truncated but cookie variables exist. */
export function inferBrowserSessionForPlugin(
  plugin: BrowserSessionPluginContext,
): BrowserSessionInfo | null {
  const fromManifest = browserSessionFromPlugin(plugin);
  if (fromManifest) return fromManifest;

  const schema = plugin.variablesSchema;
  if (!schema?.cookie) return null;

  const origins = new Set<string>();
  for (const channel of plugin.channels ?? []) {
    const rawUrl = channel.params?.url?.trim();
    if (!rawUrl) continue;
    try {
      origins.add(new URL(rawUrl).origin);
    } catch {
      // ignore invalid channel url
    }
  }
  if (origins.size === 0) return null;

  const persist: string[] = ["cookie"];
  if (schema.userAgent) persist.push("userAgent");

  return {
    pluginId: plugin.id,
    pluginName: plugin.name,
    origins: [...origins],
    persist,
  };
}

export function pluginNeedsBrowserSessionRecovery(
  plugin?: BrowserSessionPluginContext | null,
  options?: { allowEmptyFeed?: boolean },
): boolean {
  if (!plugin || !inferBrowserSessionForPlugin(plugin)) return false;
  if (options?.allowEmptyFeed) return true;
  if (!plugin?.lastError || !isLikelyBrowserSessionMessage(plugin.lastError)) return false;
  return true;
}
