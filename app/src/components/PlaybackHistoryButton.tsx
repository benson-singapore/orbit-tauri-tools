import { Icon } from "@/components/Icon";
import type { Plugin } from "@/types";

interface PlaybackHistoryButtonProps {
  plugin: Plugin;
  channelId: string;
  onClick: () => void;
  className?: string;
}

export function PlaybackHistoryButton({
  plugin,
  channelId,
  onClick,
  className = "p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500",
}: PlaybackHistoryButtonProps) {
  void plugin;
  void channelId;

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      title="播放历史"
    >
      <span className="inline-flex">
        <Icon name="history" className="w-3.5 h-3.5" />
      </span>
      <span className="hidden sm:inline">历史</span>
    </button>
  );
}
