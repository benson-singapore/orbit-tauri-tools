import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { HealthResponse, RuntimeStatusResponse } from "@/types";

let cachedBaseUrl: string | null = null;

/** 纯 Vite 调试时可设 VITE_ORBIT_RUNTIME_URL，无需 Tauri */
function viteDevRuntimeUrl(): string | null {
  const url = import.meta.env.VITE_ORBIT_RUNTIME_URL;
  return typeof url === "string" && url.length > 0 ? url : null;
}

export async function getRuntimeBaseUrl(): Promise<string | null> {
  const viteUrl = viteDevRuntimeUrl();
  if (viteUrl) {
    cachedBaseUrl = viteUrl;
    return viteUrl;
  }
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  const url = await invoke<string | null>("get_runtime_url");
  if (url) {
    cachedBaseUrl = url;
  }
  return url;
}

export function waitForRuntimeReady(): Promise<string> {
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
  const res = await fetch(`${baseUrl}/health`);
  if (!res.ok) {
    throw new Error(`health failed: ${res.status}`);
  }
  return res.json() as Promise<HealthResponse>;
}

export async function fetchStatus(
  baseUrl: string,
): Promise<RuntimeStatusResponse> {
  const res = await fetch(`${baseUrl}/v1/status`);
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
