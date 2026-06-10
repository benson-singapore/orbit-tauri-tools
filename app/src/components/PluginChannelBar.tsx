import type { PluginChannel } from "@/types";

interface PluginChannelBarProps {
  activeChannel: string;
  channels: PluginChannel[];
  onChannelChange: (channelId: string) => void;
  className?: string;
  showAllChannel?: boolean;
}

export function PluginChannelBar({
  activeChannel,
  channels,
  onChannelChange,
  className = "",
  showAllChannel = true,
}: PluginChannelBarProps) {
  if (channels.length <= 1) return null;

  return (
    <div className={`flex gap-1 overflow-x-auto pb-1 no-scrollbar ${className}`}>
      {showAllChannel ? (
        <button
          type="button"
          onClick={() => onChannelChange("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
            activeChannel === "all"
              ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm"
              : "bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
          }`}
        >
          全部
        </button>
      ) : null}
      {channels.map(ch => (
        <button
          key={ch.id}
          type="button"
          onClick={() => onChannelChange(ch.id)}
          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
            activeChannel === ch.id
              ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm"
              : "bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
          }`}
        >
          {ch.label}
        </button>
      ))}
    </div>
  );
}
