export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
  tauriVersion: string;
  isTauri: boolean;
}

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export { isTauriRuntime };

export async function loadAppInfo(): Promise<AppInfo> {
  const fallbackVersion = import.meta.env.VITE_APP_VERSION ?? "1.0.0";

  if (!isTauriRuntime()) {
    return {
      name: "orbit",
      version: fallbackVersion,
      identifier: "com.orbit.app",
      tauriVersion: "—",
      isTauri: false,
    };
  }

  try {
    const { getName, getVersion, getIdentifier, getTauriVersion } = await import(
      "@tauri-apps/api/app"
    );
    const [name, version, identifier, tauriVersion] = await Promise.all([
      getName(),
      getVersion(),
      getIdentifier(),
      getTauriVersion(),
    ]);
    return { name, version, identifier, tauriVersion, isTauri: true };
  } catch {
    return {
      name: "orbit",
      version: fallbackVersion,
      identifier: "com.orbit.app",
      tauriVersion: "—",
      isTauri: true,
    };
  }
}

export function detectPlatformLabel(): string {
  if (typeof navigator === "undefined") return "—";
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return "macOS";
  if (/Win/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return navigator.platform || "未知";
}

export function detectBuildModeLabel(): string {
  return import.meta.env.DEV ? "开发模式" : "生产模式";
}

/** Browser-accessible frontend URL (Vite dev server or configured web URL). */
export function resolveBrowserFrontendUrl(): string | null {
  const configured = import.meta.env.VITE_ORBIT_WEB_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const { origin, hostname, protocol } = window.location;
    if (
      (protocol === "http:" || protocol === "https:")
      && (hostname === "localhost" || hostname === "127.0.0.1")
    ) {
      return origin;
    }
  }

  if (import.meta.env.DEV) {
    return "http://localhost:1420";
  }

  return null;
}
