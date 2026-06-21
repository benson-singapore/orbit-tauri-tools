import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

const roots = new Map<string, Root>();
const renderedIdentities = new Map<string, string>();
const pendingUnmounts = new Map<string, ReturnType<typeof setTimeout>>();

function cancelPendingUnmount(sessionId: string): void {
  const pending = pendingUnmounts.get(sessionId);
  if (pending === undefined) return;
  clearTimeout(pending);
  pendingUnmounts.delete(sessionId);
}

export function renderSessionVideo(
  sessionId: string,
  container: HTMLElement,
  node: ReactNode,
  videoIdentity?: string,
): void {
  cancelPendingUnmount(sessionId);

  if (
    videoIdentity
    && renderedIdentities.get(sessionId) === videoIdentity
    && roots.has(sessionId)
  ) {
    return;
  }

  let root = roots.get(sessionId);
  if (!root) {
    root = createRoot(container);
    roots.set(sessionId, root);
  }
  root.render(node);
  if (videoIdentity) {
    renderedIdentities.set(sessionId, videoIdentity);
  }
}

export function unmountSessionVideo(sessionId: string): void {
  if (!roots.has(sessionId)) return;
  cancelPendingUnmount(sessionId);

  pendingUnmounts.set(
    sessionId,
    setTimeout(() => {
      pendingUnmounts.delete(sessionId);
      const root = roots.get(sessionId);
      if (!root) return;
      root.unmount();
      roots.delete(sessionId);
      renderedIdentities.delete(sessionId);
    }, 0),
  );
}

export function hasSessionVideoRoot(sessionId: string): boolean {
  return roots.has(sessionId);
}
