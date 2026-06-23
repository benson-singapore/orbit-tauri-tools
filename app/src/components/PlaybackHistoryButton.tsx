import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { listPlayback } from "@/lib/playback";
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
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listPlayback(plugin.id, { limit: 1, channelId })
      .then(result => {
        if (!cancelled) setCount(result.total ?? result.items?.length ?? 0);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [plugin.id, channelId]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      title="播放历史"
    >
      <span className="relative inline-flex">
        <Icon name="history" className="w-3.5 h-3.5" />
        {count > 0 ? (
          <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full bg-indigo-500 text-white text-[9px] leading-[14px] text-center font-medium">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
      <span className="hidden sm:inline">历史</span>
    </button>
  );
}
