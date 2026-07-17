import { runtimeFetch } from "@/lib/runtimeFetch";
import { waitForRuntimeReady } from "@/lib/runtime";

export type TTSConfig = {
  api_url: string;
  api_key: string;
};

export type TTSVoiceFilter = "recommend" | "women" | "men" | "role" | "accent";

export type TTSVoiceItem = {
  id: string;
  type: string;
  title: string;
  label: string;
  value: string;
  language: string;
  language_code: string;
  icon?: string;
  voice?: string;
  tag?: string;
};

type RuntimeDictItem = {
  label: string;
  value: string;
};

type RuntimeDictResponse = {
  items?: RuntimeDictItem[];
};

type TTSVoiceListResponse = {
  data?: TTSVoiceItem[];
};

const TTS_CONFIG_DICT_TYPE = "tts_config";
const TTS_CONFIG_LABEL = "default_v1";

function defaultTTSConfig(): TTSConfig {
  return {
    api_url: "",
    api_key: "",
  };
}

function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function buildAuthHeaders(apiKey?: string): HeadersInit {
  const trimmed = apiKey?.trim() ?? "";
  if (!trimmed) {
    return {
      accept: "application/json",
    };
  }
  return {
    accept: "application/json",
    Authorization: `Bearer ${trimmed}`,
    "x-api-key": trimmed,
  };
}

export function buildVoiceTypeUrl(apiUrl: string, type: TTSVoiceFilter): string {
  const base = normalizeApiBaseUrl(apiUrl);
  return `${base}/api/voice-type?type=${encodeURIComponent(type)}`;
}

export async function fetchTTSConfig(): Promise<TTSConfig> {
  const baseUrl = await waitForRuntimeReady();
  const dictType = encodeURIComponent(TTS_CONFIG_DICT_TYPE);
  const res = await runtimeFetch(`${baseUrl.replace(/\/$/, "")}/v1/dicts?type=${dictType}`);
  if (!res.ok) {
    return defaultTTSConfig();
  }

  const body = (await res.json()) as RuntimeDictResponse;
  const items = Array.isArray(body.items) ? body.items : [];
  const configItem = items.find(item => item.label === TTS_CONFIG_LABEL);
  if (!configItem?.value?.trim()) {
    return defaultTTSConfig();
  }

  try {
    const parsed = JSON.parse(configItem.value) as Partial<TTSConfig>;
    return {
      api_url: typeof parsed.api_url === "string" ? parsed.api_url : "",
      api_key: typeof parsed.api_key === "string" ? parsed.api_key : "",
    };
  } catch {
    return defaultTTSConfig();
  }
}

export async function saveTTSConfig(config: TTSConfig): Promise<void> {
  const baseUrl = await waitForRuntimeReady();
  const type = encodeURIComponent(TTS_CONFIG_DICT_TYPE);
  const label = encodeURIComponent(TTS_CONFIG_LABEL);
  const value = JSON.stringify({
    api_url: normalizeApiBaseUrl(config.api_url),
    api_key: config.api_key.trim(),
  });

  const res = await runtimeFetch(`${baseUrl.replace(/\/$/, "")}/v1/dicts/${type}/${label}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`save tts config failed: HTTP ${res.status} ${text}`);
  }
}

export async function fetchTTSVoiceList(
  config: TTSConfig,
  type: TTSVoiceFilter,
): Promise<TTSVoiceItem[]> {
  const url = buildVoiceTypeUrl(config.api_url, type);
  const res = await runtimeFetch(url, {
    method: "GET",
    headers: buildAuthHeaders(config.api_key),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fetch tts voice list failed: HTTP ${res.status} ${text}`);
  }

  const body = (await res.json()) as TTSVoiceListResponse | TTSVoiceItem[];
  const items = Array.isArray(body) ? body : body.data;
  return Array.isArray(items) ? items : [];
}

export async function validateTTSConfig(config: TTSConfig): Promise<void> {
  await fetchTTSVoiceList(config, "recommend");
}

export type TTSVoiceCreateRequest = {
  cache?: boolean;
  speaker: string;
  text_content: string;
};

export type TTSVoiceCreateResult = {
  id: string;
  platform: string;
  speaker: string;
  text_content: string;
  file_path: string;
  created_at: string;
  duration: number | null;
  file_size: number;
  audio_format: string;
  file_name: string;
  md5: string;
};

type TTSVoiceCreateResponse = {
  code: number;
  data: TTSVoiceCreateResult;
  message: string;
};

export function buildVoicePreviewUrl(apiUrl: string, filePath: string): string {
  const base = normalizeApiBaseUrl(apiUrl);
  return `${base}/api/voice/preview?file_path=${encodeURIComponent(filePath)}`;
}

export async function createTTSVoice(
  config: TTSConfig,
  request: TTSVoiceCreateRequest,
): Promise<TTSVoiceCreateResult> {
  const base = normalizeApiBaseUrl(config.api_url);
  const url = `${base}/api/voice/create`;
  const res = await runtimeFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      ...(config.api_key.trim()
        ? { Authorization: `Bearer ${config.api_key.trim()}`, "x-api-key": config.api_key.trim() }
        : {}),
    },
    body: JSON.stringify({
      cache: request.cache ?? false,
      speaker: request.speaker,
      text_content: request.text_content,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`create tts voice failed: HTTP ${res.status} ${text}`);
  }
  const body = (await res.json()) as TTSVoiceCreateResponse;
  if (body.code !== 200) {
    throw new Error(body.message || "create tts voice failed");
  }
  return body.data;
}
