import type { ChannelPlaybackMode } from "aplayer";
import type APlayer from "aplayer";

const STORAGE_KEY = "orbit.channelPlaybackMode";

export function shuffleOrder(length: number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
}

export function applyChannelPlaybackMode(player: APlayer, mode: ChannelPlaybackMode): void {
  switch (mode) {
    case "order":
      player.options.loop = "none";
      player.options.order = "list";
      break;
    case "loop-all":
      player.options.loop = "all";
      player.options.order = "list";
      break;
    case "loop-one":
      player.options.loop = "one";
      player.options.order = "list";
      break;
    case "shuffle":
      player.options.loop = "all";
      player.options.order = "random";
      player.randomOrder = shuffleOrder(player.list.audios.length);
      break;
  }
}

export const CHANNEL_PLAYBACK_MODES: ReadonlyArray<{
  id: ChannelPlaybackMode;
  label: string;
  title: string;
}> = [
  { id: "order", label: "顺序", title: "顺序播放，播放完停止" },
  { id: "loop-all", label: "列表循环", title: "按列表顺序循环播放" },
  { id: "loop-one", label: "单曲循环", title: "单曲循环播放" },
  { id: "shuffle", label: "随机", title: "随机打乱播放" },
];

function readPlaybackModeMemory(): Record<string, ChannelPlaybackMode> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, ChannelPlaybackMode> = {};
    for (const [key, mode] of Object.entries(parsed)) {
      if (
        typeof key === "string"
        && CHANNEL_PLAYBACK_MODES.some(entry => entry.id === mode)
      ) {
        result[key] = mode as ChannelPlaybackMode;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function readStoredChannelPlaybackMode(
  storageKey: string,
  fallback: ChannelPlaybackMode = "loop-all",
): ChannelPlaybackMode {
  return readPlaybackModeMemory()[storageKey] ?? fallback;
}

export function persistChannelPlaybackMode(
  storageKey: string,
  mode: ChannelPlaybackMode,
): void {
  try {
    const memory = readPlaybackModeMemory();
    memory[storageKey] = mode;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / private mode
  }
}
