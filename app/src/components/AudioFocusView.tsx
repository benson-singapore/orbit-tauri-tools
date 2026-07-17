import { useMemo } from "react";
import { ChannelAudioPlaylist } from "@/components/ChannelAudioPlaylist";
import { Icon } from "@/components/Icon";
import {
  articlesToAudioTracks,
  filterArticlesWithAudio,
} from "@/lib/articleAudioPlaylist";
import { isDarkTheme } from "@/lib/themeMode";
import type { Article, ThemeMode } from "@/types";

interface AudioFocusViewProps {
  theme: ThemeMode;
  runtimeBase: string | null;
  pluginId: string;
  channelId: string;
  articles: Article[];
  loading: boolean;
  loadingMore: boolean;
  searching?: boolean;
  hasMore: boolean;
  loadMoreLabel?: string;
  onLoadMore: () => void;
  onTrackPlay?: (article: Article) => void;
}

export function AudioFocusView({
  theme,
  runtimeBase,
  pluginId,
  channelId,
  articles,
  loading,
  loadingMore,
  searching = false,
  hasMore,
  loadMoreLabel,
  onLoadMore,
  onTrackPlay,
}: AudioFocusViewProps) {
  const isDark = isDarkTheme(theme);

  const playableArticles = useMemo(
    () => filterArticlesWithAudio(articles),
    [articles],
  );

  const tracks = useMemo(
    () => articlesToAudioTracks(playableArticles, runtimeBase),
    [playableArticles, runtimeBase],
  );

  const sessionId = `${pluginId}-${channelId}-audio-playlist`;

  const handleTrackChange = (index: number) => {
    const article = playableArticles[index];
    if (article) {
      onTrackPlay?.(article);
    }
  };

  if (loading || searching) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
          {searching ? "正在搜索…" : "正在加载音频列表…"}
        </div>
      </div>
    );
  }

  if (playableArticles.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 px-6 text-center">
        <div>
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${
            isDark ? "bg-neutral-800 text-neutral-400" : "bg-neutral-100 text-neutral-400"
          }`}>
            <Icon name="audio" className="h-7 w-7" />
          </div>
          <p className={`text-sm font-medium ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>
            当前频道没有可播放的音频
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            切换到其他频道，或刷新订阅源后再试
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden py-2">
      <ChannelAudioPlaylist
        sessionId={sessionId}
        tracks={tracks}
        runtimeBase={runtimeBase}
        trackCountLabel={`共 ${tracks.length} 首`}
        hasMore={hasMore}
        loadingMore={loadingMore}
        loadMoreLabel={loadMoreLabel}
        onLoadMore={onLoadMore}
        onTrackChange={handleTrackChange}
      />
    </div>
  );
}
