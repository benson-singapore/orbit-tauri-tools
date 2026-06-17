import { waitForRuntimeReady } from "@/lib/runtime";

export type LLMChatRole = "system" | "user" | "assistant";

export type LLMChatMessage = {
  role: LLMChatRole;
  content: string;
};

export type LLMProviderModel = {
  id: string;
  label?: string;
};

export type LLMProvider = {
  id: string;
  name: string;
  api_url: string;
  api_key: string;
  models: LLMProviderModel[];
};

export type LLMProvidersConfig = {
  version: number;
  providers: LLMProvider[];
  active?: {
    providerId?: string;
    modelId?: string;
  };
  promptDefaults?: {
    systemPrompt?: string;
    userPromptTemplate?: string;
  };
  promptProfiles?: Array<{
    id: string;
    name: string;
    systemPrompt?: string;
    userPromptTemplate?: string;
  }>;
  activePromptProfileId?: string;
};

type RuntimeDictItem = {
  id: number;
  type: string;
  label: string;
  value: string;
  remarks?: string;
};

const LLM_CONFIG_DICT_TYPE = "llm_config";
const LLM_CONFIG_PROVIDERS_LABEL = "providers_v1";

function defaultLLMProvidersConfig(): LLMProvidersConfig {
  return { version: 1, providers: [] };
}

export async function fetchLLMProvidersConfig(): Promise<LLMProvidersConfig> {
  const baseUrl = await waitForRuntimeReady();
  const dictType = encodeURIComponent(LLM_CONFIG_DICT_TYPE);

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/dicts?type=${dictType}`);
  if (!res.ok) {
    // If dict type doesn't exist yet, treat as empty.
    return defaultLLMProvidersConfig();
  }

  const body = (await res.json()) as { items?: RuntimeDictItem[] };
  const items = Array.isArray(body.items) ? body.items : [];
  const providersItem = items.find(it => it.label === LLM_CONFIG_PROVIDERS_LABEL);
  if (!providersItem || !providersItem.value.trim()) {
    return defaultLLMProvidersConfig();
  }

  try {
    const parsed = JSON.parse(providersItem.value) as LLMProvidersConfig;
    if (!parsed || typeof parsed !== "object") return defaultLLMProvidersConfig();
    if (!Array.isArray(parsed.providers)) return defaultLLMProvidersConfig();
    return {
      version: parsed.version || 1,
      providers: parsed.providers,
      active: parsed.active,
      promptDefaults: parsed.promptDefaults,
    };
  } catch {
    return defaultLLMProvidersConfig();
  }
}

export async function saveLLMProvidersConfig(cfg: LLMProvidersConfig): Promise<void> {
  const baseUrl = await waitForRuntimeReady();
  const type = encodeURIComponent(LLM_CONFIG_DICT_TYPE);
  const label = encodeURIComponent(LLM_CONFIG_PROVIDERS_LABEL);

  const value = JSON.stringify(cfg);

  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}/v1/dicts/${type}/${label}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`save llm providers failed: HTTP ${res.status} ${text}`);
  }
}

type LLMChatStreamSSEPayload =
  | { delta?: string; done?: boolean; error?: string }
  | Record<string, unknown>;

export async function streamLLMChat(params: {
  providerId: string;
  modelId: string;
  messages: LLMChatMessage[];
  signal?: AbortSignal;
  onDelta: (delta: string) => void;
}): Promise<void> {
  const baseUrl = await waitForRuntimeReady();
  const url = `${baseUrl.replace(/\/$/, "")}/v1/llm/chat/stream`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerId: params.providerId,
      modelId: params.modelId,
      messages: params.messages,
      stream: true,
    }),
    signal: params.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`llm stream request failed: HTTP ${res.status} ${text}`);
  }
  if (!res.body) {
    throw new Error("llm stream: empty response body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split(/\n\n/);
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n").map(l => l.trim());
      const dataLine = lines.find(l => l.startsWith("data:"));
      if (!dataLine) continue;

      const payload = dataLine.slice("data:".length).trim();
      if (!payload) continue;

      let ev: LLMChatStreamSSEPayload;
      try {
        ev = JSON.parse(payload);
      } catch {
        continue;
      }

      const obj = ev as { delta?: string; done?: boolean; error?: string };
      if (typeof obj.error === "string" && obj.error.trim()) {
        throw new Error(obj.error);
      }
      if (obj.done) {
        return;
      }
      if (typeof obj.delta === "string" && obj.delta) {
        params.onDelta(obj.delta);
      }
    }
  }
}

