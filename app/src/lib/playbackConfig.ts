import type {
  ChannelCapabilities,
  PlaybackMode,
  PlaybackConfig,
  PlaybackFeature,
  Plugin,
  ResolvedPlaybackConfig,
} from "@/types";

const DEFAULT_PLAYBACK_LIMIT = 200;

export function defaultPlaybackMode(mediaType?: string): PlaybackMode {
  switch (mediaType) {
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "manga":
      return "manga";
    case "article":
    default:
      return "article";
  }
}

function resolveChannel(plugin: Plugin | undefined, channelId: string) {
  if (!plugin?.channels?.length) return undefined;
  const id = channelId.trim();
  if (id && id !== "all") {
    return plugin.channels.find(ch => ch.id === id);
  }
  const defaultId = plugin.defaultChannel?.trim();
  if (defaultId) {
    return plugin.channels.find(ch => ch.id === defaultId);
  }
  return plugin.channels[0];
}

function hasPlaybackCapability(plugin: Plugin | undefined): boolean {
  return Boolean(plugin?.capabilities?.includes("playback"));
}

function mergePlayback(
  base: ResolvedPlaybackConfig,
  override?: PlaybackConfig | PlaybackFeature,
): ResolvedPlaybackConfig {
  if (!override) return base;
  return {
    history: override.history ?? base.history,
    progress: override.progress ?? base.progress,
    mode: override.mode ?? base.mode,
    limit: override.limit ?? base.limit,
    managedBy: "managedBy" in override && override.managedBy
      ? override.managedBy
      : base.managedBy,
  };
}

export function resolvePlaybackConfig(
  plugin: Plugin | undefined,
  channelId: string,
): ResolvedPlaybackConfig {
  const base: ResolvedPlaybackConfig = {
    history: false,
    progress: false,
    mode: defaultPlaybackMode(plugin?.mediaType),
    limit: DEFAULT_PLAYBACK_LIMIT,
    managedBy: "runtime",
  };

  let resolved = { ...base };

  if (hasPlaybackCapability(plugin)) {
    resolved = {
      ...resolved,
      history: true,
      progress: true,
    };
  }

  resolved = mergePlayback(resolved, plugin?.playback);
  const channel = resolveChannel(plugin, channelId);
  if (channel?.features?.playback) {
    resolved = mergePlayback(resolved, channel.features.playback);
  }
  return resolved;
}

export function resolveEffectivePlayback(
  plugin: Plugin | undefined,
  channelId: string,
  channelCapabilities?: Pick<ChannelCapabilities, "playback">,
): ResolvedPlaybackConfig {
  if (channelCapabilities?.playback) {
    return channelCapabilities.playback;
  }
  return resolvePlaybackConfig(plugin, channelId);
}

export function isPlaybackHistoryEnabled(
  plugin: Plugin | undefined,
  channelId: string,
  channelCapabilities?: Pick<ChannelCapabilities, "playback">,
): boolean {
  return resolveEffectivePlayback(plugin, channelId, channelCapabilities).history;
}
