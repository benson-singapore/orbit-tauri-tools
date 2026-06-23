import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { ProxiedImage } from "@/components/ProxiedImage";
import { deleteAllPlayback, deletePlayback, listPlayback } from "@/lib/playback";
import { resolveEffectivePlayback } from "@/lib/playbackConfig";
import { formatPlaybackProgressLabel } from "@/lib/playbackResume";
import type { PlaybackRecord, Plugin, ThemeMode } from "@/types";
import { isDarkTheme } from "@/lib/themeMode";

interface PlaybackHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  plugin: Plugin;
  channelId: string;
  runtimeBase: string | null;
  theme: ThemeMode;
  onSelect: (record: PlaybackRecord) => void;
}

export function PlaybackHistoryPanel({
  open,
  onClose,
  plugin,
  channelId,
  runtimeBase,
  theme,
  onSelect,
}: PlaybackHistoryPanelProps) {
  const [items, setItems] = useState<PlaybackRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const config = resolveEffectivePlayback(plugin, channelId);
  const isDark = isDarkTheme(theme);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listPlayback(plugin.id, {
        limit: config.limit,
        channelId,
      });
      const sorted = [...(result.items ?? [])].sort(
        (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
      );
      setItems(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [plugin.id, channelId, config.limit]);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  const handleDelete = async (record: PlaybackRecord) => {
    try {
      await deletePlayback(plugin.id, record.parentId);
      setItems(prev => prev.filter(item => item.parentId !== record.parentId));
    } catch (err) {
      console.error("delete playback failed", err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("确定清空全部播放历史？")) return;
    try {
      await deleteAllPlayback(plugin.id, channelId);
      setItems([]);
    } catch (err) {
      console.error("clear playback failed", err);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="关闭播放历史"
        onClick={onClose}
      />
      <aside
        className={`relative h-full w-full max-w-md shadow-xl border-l flex flex-col ${
          isDark
            ? "bg-[#141416] border-[var(--orbit-border)] text-white"
            : "bg-white border-neutral-100 text-neutral-900"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-inherit">
          <div>
            <h2 className="text-sm font-semibold">播放历史</h2>
            <p className="text-[11px] text-neutral-400 mt-0.5">{plugin.name}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
              title="刷新"
            >
              <Icon name="refresh" className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
              title="关闭"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {items.length > 0 ? (
          <div className="px-4 py-2 border-b border-inherit">
            <button
              type="button"
              onClick={() => void handleClearAll()}
              className="text-[11px] text-rose-500 hover:underline"
            >
              清空全部
            </button>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && items.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-8">加载中…</p>
          ) : error ? (
            <p className="text-sm text-rose-500 text-center py-8">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-8">暂无播放历史</p>
          ) : (
            items.map(record => {
              const mode = record.mode ?? config.mode;
              const progressLabel = formatPlaybackProgressLabel(mode, record.progress);
              return (
                <div
                  key={record.parentId}
                  className={`flex gap-3 p-2.5 rounded-xl border transition-colors ${
                    isDark
                      ? "border-[var(--orbit-border)] hover:bg-neutral-800/50"
                      : "border-neutral-100 hover:bg-neutral-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(record)}
                    className="flex flex-1 gap-3 min-w-0 text-left"
                  >
                    <div className="w-14 h-20 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800 shrink-0">
                      {record.cover ? (
                        <ProxiedImage
                          runtimeBase={runtimeBase}
                          src={record.cover}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-400">
                          <Icon name="play" className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {record.parentTitle || record.parentId}
                      </div>
                      {record.chapterTitle ? (
                        <div className="text-xs text-neutral-400 truncate mt-0.5">
                          {record.chapterTitle}
                        </div>
                      ) : null}
                      {progressLabel ? (
                        <div className="text-[11px] text-indigo-500 dark:text-indigo-400 mt-1">
                          {progressLabel}
                        </div>
                      ) : null}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(record)}
                    className="self-start p-1 rounded-lg text-neutral-400 hover:text-rose-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    title="删除"
                  >
                    <Icon name="close" className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
