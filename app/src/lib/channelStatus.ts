export type ChannelStatus = "enabled" | "disabled";

/** status が空の場合は enabled として扱う */
export function normalizeChannelStatus(status?: string): ChannelStatus {
  const normalized = (status ?? "").trim().toLowerCase();
  return normalized === "disabled" ? "disabled" : "enabled";
}

export function isChannelEnabled(status?: string): boolean {
  return normalizeChannelStatus(status) === "enabled";
}
