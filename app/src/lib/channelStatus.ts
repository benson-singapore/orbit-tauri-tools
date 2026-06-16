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

export const DYNAMIC_SEARCH_MAX_PAGES = 20;
