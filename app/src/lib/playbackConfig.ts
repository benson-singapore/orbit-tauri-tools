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
    case "novel":
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

export function isClientManagedPlayback(managedBy: string | undefined): boolean {
  return managedBy === "runtime" || managedBy === "plugin";
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

export function resolveChapterReadingPlayback(
  plugin: Plugin | undefined,
  detailChannelId: string,
  feedChannelId: string,
  feedChannelCapabilities?: Pick<ChannelCapabilities, "playback">,
): ResolvedPlaybackConfig {
  const fromDetail = resolvePlaybackConfig(plugin, detailChannelId);
  const fromFeedManifest = feedChannelId.trim() && feedChannelId !== detailChannelId
    ? resolvePlaybackConfig(plugin, feedChannelId)
    : null;

  let resolved: ResolvedPlaybackConfig = fromDetail;
  if (fromFeedManifest) {
    resolved = {
      ...resolved,
      history: resolved.history || fromFeedManifest.history,
      progress: resolved.progress || fromFeedManifest.progress,
      mode: fromFeedManifest.mode || resolved.mode,
      managedBy: isClientManagedPlayback(fromFeedManifest.managedBy)
        ? fromFeedManifest.managedBy
        : resolved.managedBy,
    };
  }

  if (!feedChannelCapabilities?.playback) {
    return resolved;
  }

  const merged = mergePlayback(resolved, feedChannelCapabilities.playback);
  return {
    ...merged,
    history: resolved.history || merged.history,
    progress: resolved.progress || merged.progress,
    managedBy: isClientManagedPlayback(merged.managedBy)
      ? merged.managedBy
      : resolved.managedBy,
  };
}

export function resolvePlaybackCapabilitiesForChannel(
  channelId: string,
  activeChannelId: string,
  channelCapabilities?: Pick<ChannelCapabilities, "playback">,
): Pick<ChannelCapabilities, "playback"> | undefined {
  if (!channelCapabilities?.playback) return undefined;
  if (channelId.trim() !== activeChannelId.trim()) return undefined;
  return channelCapabilities;
}

export function resolveEffectivePlayback(
  plugin: Plugin | undefined,
  channelId: string,
  channelCapabilities?: Pick<ChannelCapabilities, "playback">,
): ResolvedPlaybackConfig {
  const fromConfig = resolvePlaybackConfig(plugin, channelId);
  if (!channelCapabilities?.playback) {
    return fromConfig;
  }
  return mergePlayback(fromConfig, channelCapabilities.playback);
}

export function isPlaybackHistoryEnabled(
  plugin: Plugin | undefined,
  channelId: string,
  channelCapabilities?: Pick<ChannelCapabilities, "playback">,
): boolean {
  return resolveEffectivePlayback(plugin, channelId, channelCapabilities).history;
}
