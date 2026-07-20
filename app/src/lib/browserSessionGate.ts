import type { BrowserSessionInfo } from "@/types";

type SessionRequestHandler = (
  session: BrowserSessionInfo,
) => Promise<Record<string, string> | null>;

let handler: SessionRequestHandler | null = null;

export function registerBrowserSessionHandler(next: SessionRequestHandler | null): void {
  handler = next;
}

export async function requestBrowserSession(
  session: BrowserSessionInfo,
): Promise<Record<string, string> | null> {
  if (!handler) return null;
  return handler(session);
}
