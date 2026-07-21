import { useCallback, useState } from "react";
import { Icon } from "@/components/Icon";
import { isTauriRuntime } from "@/lib/appInfo";
import { inferBrowserSessionForPlugin } from "@/lib/browserSessionError";
import { openPluginSessionWindow } from "@/lib/pluginSession";
import type { Plugin } from "@/types";

interface BrowserSessionButtonProps {
  plugin: Plugin;
  channelId: string;
  className?: string;
}

export function BrowserSessionButton({
  plugin,
  channelId,
  className = "p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500",
}: BrowserSessionButtonProps) {
  const [opening, setOpening] = useState(false);
  const session = inferBrowserSessionForPlugin(plugin);

  const handleOpen = useCallback(async () => {
    if (!session || opening) return;
    setOpening(true);
    try {
      const channel = plugin.channels?.find(item => item.id === channelId);
      await openPluginSessionWindow(session, channel);
    } catch (err) {
      console.error("[browser-session] open window failed", plugin.id, err);
    } finally {
      setOpening(false);
    }
  }, [channelId, opening, plugin, session]);

  if (!isTauriRuntime() || !session) return null;

  return (
    <button
      type="button"
      onClick={() => void handleOpen()}
      disabled={opening}
      className={`${className} disabled:opacity-50 disabled:cursor-not-allowed`}
      title="打开内置浏览器完成网站验证"
    >
      <Icon name="globe" className={`w-3.5 h-3.5 ${opening ? "animate-pulse" : ""}`} />
      <span className="hidden sm:inline">浏览器</span>
    </button>
  );
}
