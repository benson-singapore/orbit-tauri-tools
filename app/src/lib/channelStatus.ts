export type ChannelStatus = "enabled" | "disabled";

export function normalizeChannelStatus(status?: string): ChannelStatus {
  return status === "disabled" ? "disabled" : "enabled";
}

export function isChannelEnabled(status?: string): boolean {
  return normalizeChannelStatus(status) === "enabled";
}

export function isChannelDynamic(
  channel?: {
    features?: { feed?: { persist?: boolean } };
    dynamic?: boolean;
  },
): boolean {
  if (channel?.features?.feed?.persist === false) {
    return true;
  }
  return channel?.dynamic === true;
}

export function channelHasDynamicSearch(
  channel?: {
    features?: { search?: unknown };
    type?: string;
  } | null,
): boolean {
  return Boolean(channel?.features?.search) || channel?.type === "search";
}

export function findDynamicSearchChannel<
  T extends {
    id: string;
    features?: { search?: unknown };
    type?: string;
    status?: string;
  },
>(channels: T[]): T | undefined {
  return channels.find(ch => isChannelEnabled(ch.status) && channelHasDynamicSearch(ch));
}

export const DYNAMIC_SEARCH_MAX_PAGES = 20;
