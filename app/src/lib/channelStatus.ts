import type { PluginChannel } from "@/types";

export type ChannelStatus = "enabled" | "disabled";

export const DYNAMIC_SEARCH_MAX_PAGES = 20;

function isSearchRoute(route?: string): boolean {
  const normalized = (route ?? "").trim().toLowerCase();
  return normalized.includes("/search/") || normalized.endsWith("/search");
}

export function isSearchDynamicChannel(
  channel?: Pick<PluginChannel, "dynamic" | "type" | "route">,
): boolean {
  if (channel?.type === "search") {
    return true;
  }
  return isSearchRoute(channel?.route);
}

export function isChannelDynamic(
  channel?: Pick<PluginChannel, "dynamic" | "type" | "route">,
): boolean {
  if (channel?.dynamic === true) {
    return true;
  }
  return isSearchDynamicChannel(channel);
}

/** status が空の場合は enabled として扱う */
export function normalizeChannelStatus(status?: string): ChannelStatus {
  const normalized = (status ?? "").trim().toLowerCase();
  return normalized === "disabled" ? "disabled" : "enabled";
}

export function isChannelEnabled(status?: string): boolean {
  return normalizeChannelStatus(status) === "enabled";
}
