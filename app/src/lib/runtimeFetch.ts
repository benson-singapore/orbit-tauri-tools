import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/appInfo";

type FetchFn = typeof fetch;

let tauriPluginFetch: FetchFn | null = null;

interface RuntimeHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function headersFromInit(init?: RequestInit): Record<string, string> | undefined {
  if (!init?.headers) {
    return undefined;
  }
  if (init.headers instanceof Headers) {
    const out: Record<string, string> = {};
    init.headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  return Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k, String(v)]));
}

function bodyToString(init?: RequestInit): string | undefined {
  const body = init?.body;
  if (body == null) {
    return undefined;
  }
  if (typeof body === "string") {
    return body;
  }
  return undefined;
}

/** Binary/multipart bodies must use plugin-http; rust runtime_http only accepts strings. */
function needsPluginHttp(init?: RequestInit): boolean {
  const body = init?.body;
  if (body == null) {
    return false;
  }
  return (
    body instanceof FormData
    || body instanceof Blob
    || body instanceof ArrayBuffer
    || ArrayBuffer.isView(body)
  );
}

async function resolvePluginFetch(): Promise<FetchFn> {
  if (!tauriPluginFetch) {
    const mod = await import("@tauri-apps/plugin-http");
    tauriPluginFetch = mod.fetch as FetchFn;
  }
  return tauriPluginFetch;
}

async function rustRuntimeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const result = await invoke<RuntimeHttpResponse>("runtime_http", {
    req: {
      url: resolveUrl(input),
      method: init?.method,
      body: bodyToString(init),
      headers: headersFromInit(init),
    },
  });

  return new Response(result.body, {
    status: result.status,
    headers: result.headers,
  });
}

/** HTTP fetch for desktop app — local runtime uses Rust reqwest (no_proxy); external uses plugin-http. */
export async function runtimeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!isTauriRuntime()) {
    return fetch(input, init);
  }

  const url = resolveUrl(input);
  const isLocalRuntime =
    url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:");

  if (isLocalRuntime && !needsPluginHttp(init)) {
    return rustRuntimeFetch(input, init);
  }

  const impl = await resolvePluginFetch();
  return impl(input, init);
}
