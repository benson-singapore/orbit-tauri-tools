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

export async function loadAppInfo(): Promise<AppInfo> {
  const fallbackVersion = import.meta.env.VITE_APP_VERSION ?? "0.1.0";

  if (!isTauriRuntime()) {
    return {
      name: "Orbit Reader",
      version: fallbackVersion,
      identifier: "com.orbit.reader",
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
      name: "Orbit Reader",
      version: fallbackVersion,
      identifier: "com.orbit.reader",
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
