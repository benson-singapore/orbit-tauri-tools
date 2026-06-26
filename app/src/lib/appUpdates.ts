import { invoke } from "@tauri-apps/api/core";
import { runtimeFetch } from "@/lib/runtimeFetch";
import { isTauriRuntime } from "@/lib/appInfo";

const APP_UPDATE_API_BASE = "https://orbit-api.nnbtech.com/api/v1/app";

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export interface ReleasePlatform {
  id: string;
  label: string;
}

export interface AppReleaseItem {
  id: string;
  appVersion: string;
  runtimeVersion: string;
  releaseChannel: string;
  releaseNotes: string;
  status: string;
  isCurrent: boolean;
  publishedAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppUpdateCheckResult {
  updateAvailable: boolean;
  channel: string;
  current: {
    appVersion: string;
    runtimeVersion: string;
    isLatest: boolean;
  };
  latest: {
    appVersion: string;
    runtimeVersion: string;
    releaseNotes: string;
    publishedAt: string;
    isLatest: boolean;
  } | null;
  download: {
    id: string;
    platform: string;
    url: string;
    source: string;
    fileSize: number;
    filename: string;
    createdAt: string;
  } | null;
}

export interface AppPlatformInfo {
  id: string;
  os: string;
  arch: string;
}

const PLATFORM_LABEL_FALLBACKS: Record<string, string> = {
  "darwin-aarch64": "macOS (Apple Silicon)",
  "darwin-x86_64": "macOS (Intel)",
  "windows-x86_64": "Windows",
  "linux-x86_64": "Linux",
};

export function normalizePlatformId(platformId: string): string {
  const [os = "unknown", arch = "x86_64"] = platformId.split("-");
  const normalizedOs = os === "macos" ? "darwin" : os;
  return `${normalizedOs}-${arch}`;
}

export function platformLabel(
  platformId: string,
  platforms: ReleasePlatform[] = [],
): string {
  const normalizedId = normalizePlatformId(platformId);
  return (
    platforms.find(item => item.id === normalizedId)?.label
    ?? PLATFORM_LABEL_FALLBACKS[normalizedId]
    ?? normalizedId
  );
}

export interface AppUpdateSummary {
  updateAvailable: boolean;
  loading: boolean;
  platformId: string | null;
  latestVersion: string | null;
  channel: string | null;
  error: string | null;
}

function buildApiUrl(path: string, params?: Record<string, string | undefined>): string {
  const url = new URL(`${APP_UPDATE_API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function fetchApi<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const response = await runtimeFetch(buildApiUrl(path, params), {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`更新接口请求失败（${response.status}）`);
  }
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (payload.code !== 200) {
    throw new Error(payload.message || "更新接口返回异常");
  }
  return payload.data;
}

function inferOs(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const platform = navigator.platform || "";
  if (/Mac/i.test(ua) || /Mac/i.test(platform)) return "darwin";
  if (/Win/i.test(ua) || /Win/i.test(platform)) return "windows";
  if (/Linux/i.test(ua) || /Linux/i.test(platform)) return "linux";
  return "unknown";
}

function inferArch(): string {
  if (typeof navigator === "undefined") return "x86_64";
  const userAgentDataPlatform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    ?? "";
  const hints = [
    navigator.userAgent,
    navigator.platform,
    userAgentDataPlatform,
  ]
    .filter(Boolean)
    .join(" ");
  return /(arm64|aarch64|apple silicon)/i.test(hints) ? "aarch64" : "x86_64";
}

export async function resolveCurrentPlatformInfo(): Promise<AppPlatformInfo> {
  if (isTauriRuntime()) {
    try {
      const platformId = normalizePlatformId(await invoke<string>("get_app_platform"));
      const [os = "unknown", arch = "x86_64"] = platformId.split("-");
      return { id: platformId, os, arch };
    } catch {
      // Fall through to browser heuristics.
    }
  }

  const os = inferOs();
  const arch = inferArch();
  const id = normalizePlatformId(`${os}-${arch}`);
  return {
    id,
    os: id.split("-")[0] ?? os,
    arch: id.split("-")[1] ?? arch,
  };
}

export async function fetchReleasePlatforms(): Promise<ReleasePlatform[]> {
  const data = await fetchApi<{ platforms: ReleasePlatform[] }>("/platforms");
  return data.platforms ?? [];
}

export async function fetchReleaseHistory(): Promise<AppReleaseItem[]> {
  const data = await fetchApi<{ items: AppReleaseItem[] }>("/releases");
  return data.items ?? [];
}

export async function checkAppUpdate(
  appVersion: string,
  platformId: string,
): Promise<AppUpdateCheckResult> {
  return fetchApi<AppUpdateCheckResult>("/update-check", {
    appVersion,
    platform: normalizePlatformId(platformId),
  });
}
