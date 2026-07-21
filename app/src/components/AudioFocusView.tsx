import { useCallback, useEffect, useMemo, useState } from "react";
import { ChannelAudioPlaylist } from "@/components/ChannelAudioPlaylist";
import { Icon } from "@/components/Icon";
import { articlesToListAudioTracks } from "@/lib/articleAudioPlaylist";
import { resolveArticleAudioUrl } from "@/lib/articleAudioUrl";
import { mergeArticleListWithDetail } from "@/lib/articleContent";
import { resolveArticleDetailChannel } from "@/lib/browseDynamicFeed";
import { fetchFeedItem } from "@/lib/feed";
import {
  browserSessionOptionsFromPlugin,
  runtimeOpenDetail,
  shouldUseRuntimeV2,
} from "@/lib/runtimeV2";
import { isDarkTheme } from "@/lib/themeMode";
import type { ReaderAudioTrack } from "@/components/ReaderAudioPlayer";
import type { Article, Plugin, ThemeMode } from "@/types";

interface AudioFocusViewProps {
  theme: ThemeMode;
  runtimeBase: string | null;
  pluginId: string;
  channelId: string;
  pluginMeta?: Plugin | null;
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
  pluginMeta,
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
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [resolvedCovers, setResolvedCovers] = useState<Record<string, string>>({});

  useEffect(() => {
    setResolvedUrls({});
    setResolvedCovers({});
  }, [pluginId, channelId]);

  const tracks = useMemo(
    () => articlesToListAudioTracks(
      articles,
      resolvedUrls,
      { listArticles: articles },
      resolvedCovers,
    ),
    [articles, resolvedUrls, resolvedCovers],
  );

  const sessionId = `${pluginId}-${channelId}-audio-playlist`;

  const resolveTrackUrl = useCallback(async (
    index: number,
    _track: ReaderAudioTrack,
  ): Promise<string | null> => {
    const article = articles[index];
    if (!article) return null;

    const cached = resolvedUrls[article.id] ?? resolveArticleAudioUrl(article);
    if (cached) {
      return cached;
    }

    try {
      const detailChannelId = resolveArticleDetailChannel(
        article,
        pluginMeta,
        channelId,
      );
      let detail: Article;

      if (shouldUseRuntimeV2(article.pluginId, pluginMeta) && detailChannelId !== "all") {
        const result = await runtimeOpenDetail(article.pluginId, detailChannelId, article.id, {
          ...browserSessionOptionsFromPlugin(pluginMeta),
        });
        if (!result.item) {
          return null;
        }
        detail = mergeArticleListWithDetail(article, result.item);
      } else {
        detail = mergeArticleListWithDetail(
          article,
          await fetchFeedItem(article.id, {
            pluginId,
            channelId: detailChannelId,
          }),
        );
      }

      const url = resolveArticleAudioUrl(detail);
      if (!url) {
        return null;
      }

      const cover = detail.image?.trim();
      setResolvedUrls(prev => ({ ...prev, [article.id]: url }));
      if (cover) {
        setResolvedCovers(prev => (
          prev[article.id] === cover ? prev : { ...prev, [article.id]: cover }
        ));
      }
      return url;
    } catch (error) {
      console.error("resolve audio track url failed", error);
      return null;
    }
  }, [articles, channelId, pluginId, pluginMeta, resolvedUrls]);

  const handleTrackChange = (index: number) => {
    const article = articles[index];
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

  if (articles.length === 0) {
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
        resolveTrackUrl={resolveTrackUrl}
      />
    </div>
  );
}
