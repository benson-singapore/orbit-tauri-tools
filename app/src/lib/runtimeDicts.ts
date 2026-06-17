import { waitForRuntimeReady } from "@/lib/runtime";

export type RuntimeSettingConfigDictItem = {
  id: number;
  type: string;
  label: string;
  value: string;
};

type RuntimeSettingConfigDictResponse = {
  items?: RuntimeSettingConfigDictItem[];
};

export async function fetchSettingConfigDicts(): Promise<RuntimeSettingConfigDictItem[]> {
  const baseUrl = await waitForRuntimeReady();
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/dicts?type=setting_config`);
  if (!res.ok) {
    throw new Error(`fetch setting_config dicts failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as RuntimeSettingConfigDictResponse;
  return Array.isArray(body.items) ? body.items : [];
}

