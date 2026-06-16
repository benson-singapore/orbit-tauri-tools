import { isChannelEnabled } from "@/lib/channelStatus";
import type { Article, Plugin, PluginChannel } from "@/types";

function isImagePlugin(plugin?: Plugin | null): boolean {
  return plugin?.mediaType === "image";
}

/** 仅 image 插件且频道显式 dynamic: true 时为浏览型（隐藏搜索框） */
export function isBrowseDynamicChannel(
  channel?: PluginChannel | null,
  plugin?: Plugin | null,
): boolean {
  if (!channel || !isImagePlugin(plugin)) return false;
  return channel.dynamic === true;
}

export function isBrowseDynamicPlugin(
  plugin?: Plugin | null,
  channels?: PluginChannel[],
): boolean {
  if (!isImagePlugin(plugin)) return false;
  const enabled = (channels ?? plugin?.channels ?? []).filter(ch =>
    isChannelEnabled(ch.status),
  );
  return enabled.length > 0 && enabled.every(ch => isBrowseDynamicChannel(ch, plugin));
}

export function isBrowseDynamicFeedMode(
  plugin: Plugin | null | undefined,
  channels: PluginChannel[],
  activeChannelId: string,
): boolean {
  if (!isBrowseDynamicPlugin(plugin, channels)) return false;
  if (activeChannelId === "all") return true;
  const active = channels.find(ch => ch.id === activeChannelId);
  return isBrowseDynamicChannel(active, plugin);
}

export function resolveDefaultPluginChannel(
  plugin: Plugin | undefined | null,
  channels: PluginChannel[],
  storedChannelId?: string | null,
): string {
  const enabled = channels.filter(ch => isChannelEnabled(ch.status));
  if (enabled.length === 0) return "all";
  if (
    storedChannelId
    && storedChannelId !== "all"
    && enabled.some(ch => ch.id === storedChannelId)
  ) {
    return storedChannelId;
  }
  const defaultId = plugin?.defaultChannel?.trim();
  if (defaultId && enabled.some(ch => ch.id === defaultId)) {
    return defaultId;
  }
  return enabled[0]!.id;
}

export function resolveBrowseDynamicChannel(
  plugin: Plugin,
  channels: PluginChannel[],
  storedChannelId?: string | null,
): string {
  return resolveDefaultPluginChannel(plugin, channels, storedChannelId);
}

export function resolveFeedChannelId(
  plugin: Plugin | undefined,
  channels: PluginChannel[],
  channelId: string,
  storedChannelId?: string | null,
): string {
  if (plugin && channelId === "all" && isBrowseDynamicPlugin(plugin, channels)) {
    return resolveBrowseDynamicChannel(plugin, channels, storedChannelId);
  }
  return channelId;
}

/** 浏览型 dynamic image 频道条目：列表数据已完整，无需再拉 /v1/feed/item */
export function isBrowseDynamicImageArticle(
  article: Pick<Article, "pluginId" | "channelId">,
  plugin?: Plugin | null,
): boolean {
  if (!isImagePlugin(plugin) || !article.channelId) return false;
  const channel = (plugin?.channels ?? []).find(ch => ch.id === article.channelId);
  return isBrowseDynamicChannel(channel, plugin);
}

/** rating 插件（评分排行榜）：列表项已含完整展示字段，无需再拉 /v1/feed/item */
export function isRatingPluginArticle(
  _article: Pick<Article, "pluginId">,
  plugin?: Plugin | null,
): boolean {
  return plugin?.mediaType === "rating";
}

/** 列表记录即可作为详情展示，跳过 /v1/feed/item */
export function shouldSkipFeedItemDetailFetch(
  article: Pick<Article, "pluginId" | "channelId">,
  plugin?: Plugin | null,
): boolean {
  return (
    isBrowseDynamicImageArticle(article, plugin)
    || isRatingPluginArticle(article, plugin)
  );
}

