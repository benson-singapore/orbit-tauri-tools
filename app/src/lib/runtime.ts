import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "@/lib/appInfo";
import { runtimeFetch } from "@/lib/runtimeFetch";
import type { HealthResponse, RuntimeStatusResponse } from "@/types";

let cachedBaseUrl: string | null = null;

/** Synchronous access after {@link getRuntimeBaseUrl} or {@link waitForRuntimeReady} resolves. */
export function getCachedRuntimeBaseUrl(): string | null {
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  // Browser-only dev: VITE_ORBIT_RUNTIME_URL is authoritative.
  if (!isTauriRuntime()) {
    return viteDevRuntimeUrl();
  }
  return null;
}

/** 纯 Vite 调试时可设 VITE_ORBIT_RUNTIME_URL，无需 Tauri */
function viteDevRuntimeUrl(): string | null {
  const url = import.meta.env.VITE_ORBIT_RUNTIME_URL;
  return typeof url === "string" && url.length > 0 ? url : null;
}

export async function getRuntimeBaseUrl(): Promise<string | null> {
  if (isTauriRuntime()) {
    const url = await invoke<string | null>("get_runtime_url");
    if (url) {
      cachedBaseUrl = url;
      return url;
    }
  }

  const viteUrl = viteDevRuntimeUrl();
  if (viteUrl) {
    cachedBaseUrl = viteUrl;
    return viteUrl;
  }

  return cachedBaseUrl;
}

let runtimeReadyListener: Promise<void> | null = null;

function ensureRuntimeReadyListener(): void {
  if (runtimeReadyListener) {
    return;
  }
  runtimeReadyListener = (async () => {
    await listen<string>("runtime-ready", (event) => {
      cachedBaseUrl = event.payload;
    });
  })();
}

export function waitForRuntimeReady(): Promise<string> {
  ensureRuntimeReadyListener();
  return new Promise((resolve) => {
    void (async () => {
      const existing = await getRuntimeBaseUrl();
      if (existing) {
        resolve(existing);
        return;
      }

      const unlisten = await listen<string>("runtime-ready", (event) => {
        cachedBaseUrl = event.payload;
        void unlisten();
        resolve(event.payload);
      });

      // Fallback poll
      const interval = window.setInterval(async () => {
        const url = await getRuntimeBaseUrl();
        if (url) {
          window.clearInterval(interval);
          void unlisten();
          resolve(url);
        }
      }, 200);
    })();
  });
}

export async function fetchHealth(baseUrl: string): Promise<HealthResponse> {
  const res = await fetchHealthWithRetry(baseUrl);
  if (!res.ok) {
    throw new Error(`health failed: ${res.status}`);
  }
  return res.json() as Promise<HealthResponse>;
}

async function fetchHealthWithRetry(
  baseUrl: string,
  attempts = 8,
): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await runtimeFetch(`${baseUrl}/health`);
      if (res.ok || i === attempts - 1) {
        return res;
      }
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchStatus(
  baseUrl: string,
): Promise<RuntimeStatusResponse> {
  const res = await runtimeFetch(`${baseUrl}/v1/status`);
  if (!res.ok) {
    throw new Error(`status failed: ${res.status}`);
  }
  return res.json() as Promise<RuntimeStatusResponse>;
}

export async function loadRuntimeStatus(): Promise<{
  health: HealthResponse;
  status: RuntimeStatusResponse;
}> {
  const baseUrl = await waitForRuntimeReady();
  const [health, status] = await Promise.all([
    fetchHealth(baseUrl),
    fetchStatus(baseUrl),
  ]);
  return { health, status };
}
