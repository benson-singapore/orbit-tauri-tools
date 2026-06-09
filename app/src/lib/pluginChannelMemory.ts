const STORAGE_KEY = "orbit.pluginChannelMemory";

type PluginChannelMemory = Record<string, string>;

function readMemory(): PluginChannelMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: PluginChannelMemory = {};
    for (const [pluginId, channelId] of Object.entries(parsed)) {
      if (
        typeof pluginId === "string"
        && pluginId.length > 0
        && typeof channelId === "string"
        && channelId.length > 0
      ) {
        result[pluginId] = channelId;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** プラグインごとに最後に開いたチャンネル ID を取得（未保存なら null） */
export function getStoredPluginChannel(pluginId: string): string | null {
  return readMemory()[pluginId] ?? null;
}

/** プラグインの最後に開いたチャンネル ID を保存 */
export function persistPluginChannel(pluginId: string, channelId: string): void {
  try {
    const memory = readMemory();
    memory[pluginId] = channelId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / private mode
  }
}
