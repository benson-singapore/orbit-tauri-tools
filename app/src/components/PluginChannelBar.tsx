import type { PluginChannel } from "@/types";

interface PluginChannelBarProps {
  activeChannel: string;
  channels: PluginChannel[];
  onChannelChange: (channelId: string) => void;
  className?: string;
  minChannels?: number;
}

export function PluginChannelBar({
  activeChannel,
  channels,
  onChannelChange,
  className = "",
  minChannels = 2,
}: PluginChannelBarProps) {
  if (channels.length < minChannels) return null;

  return (
    <div className={`flex gap-1 overflow-x-auto pb-1 no-scrollbar ${className}`}>
      {channels.map(ch => (
        <button
          key={ch.id}
          type="button"
          onClick={() => onChannelChange(ch.id)}
          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
            activeChannel === ch.id
              ? "orbit-filter-chip orbit-filter-chip--active"
              : "orbit-filter-chip"
          }`}
        >
          {ch.label}
        </button>
      ))}
    </div>
  );
}
