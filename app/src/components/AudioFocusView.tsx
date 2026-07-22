import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChannelAudioPlaylist } from "@/components/ChannelAudioPlaylist";
import { Icon } from "@/components/Icon";
import {
  articlesToListAudioTracks,
  stabilizePlaylistArticleOrder,
} from "@/lib/articleAudioPlaylist";
import { downloadAudioTrack } from "@/lib/articleAudioDownload";
import { extractLyricsFromSummary } from "@/lib/audioLyrics";
import { isPendingAudioTrackUrl, resolveArticleAudioUrl } from "@/lib/articleAudioUrl";
import { mergeArticleListWithDetail } from "@/lib/articleContent";
import { resolveArticleDetailChannel } from "@/lib/browseDynamicFeed";
import { fetchFeedItem } from "@/lib/feed";
import {
  browserSessionOptionsFromPlugin,
  runtimeOpenDetail,
  shouldUseRuntimeV2,
} from "@/lib/runtimeV2";
import { isDarkTheme } from "@/lib/themeMode";
import { isPluginFavoritesChannel } from "@/lib/pluginFavorites";
import type { ResolveTrackUrlOptions } from "@/hooks/useOrbitAudioPlayer";
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
  showFavorites?: boolean;
  favoritedArticleIds?: Set<string>;
  onToggleFavorite?: (article: Article, event: MouseEvent) => void;
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
  showFavorites = false,
  favoritedArticleIds,
  onToggleFavorite,
}: AudioFocusViewProps) {
  const isDark = isDarkTheme(theme);
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [resolvedCovers, setResolvedCovers] = useState<Record<string, string>>({});
  const [resolvedLyrics, setResolvedLyrics] = useState<Record<string, string>>({});
  const playlistOrderRef = useRef<string[]>([]);
  const playlistScopeRef = useRef(`${pluginId}-${channelId}`);

  useEffect(() => {
    setResolvedUrls({});
    setResolvedCovers({});
    setResolvedLyrics({});
  }, [pluginId, channelId]);

  const playlistArticles = useMemo(() => {
    const scopeKey = `${pluginId}-${channelId}`;
    if (playlistScopeRef.current !== scopeKey) {
      playlistScopeRef.current = scopeKey;
      playlistOrderRef.current = [];
    }

    const stabilized = stabilizePlaylistArticleOrder(playlistOrderRef.current, articles);
    playlistOrderRef.current = stabilized.order;
    return stabilized.items;
  }, [articles, pluginId, channelId]);

  const tracks = useMemo(
    () => articlesToListAudioTracks(
      playlistArticles,
      resolvedUrls,
      { listArticles: articles },
      resolvedCovers,
      resolvedLyrics,
    ),
    [playlistArticles, articles, resolvedUrls, resolvedCovers, resolvedLyrics],
  );

  const sessionId = `${pluginId}-${channelId}-audio-playlist`;

  const resolveTrackUrl = useCallback(async (
    index: number,
    _track: ReaderAudioTrack,
    options?: ResolveTrackUrlOptions,
  ): Promise<string | null> => {
    const article = playlistArticles[index];
    if (!article) return null;

    const forceRefresh = options?.forceRefresh === true;
    const cachedUrl = resolvedUrls[article.id] ?? resolveArticleAudioUrl(article);
    const listLyrics = extractLyricsFromSummary(article.summary);
    const lyricsResolved = Boolean(listLyrics || article.id in resolvedLyrics);
    if (!forceRefresh && cachedUrl && lyricsResolved) {
      return cachedUrl;
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
          forceRefresh,
        });
        if (!result.item) {
          return cachedUrl;
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

      const url = resolveArticleAudioUrl(detail) ?? cachedUrl;
      if (!url) {
        return null;
      }

      const cover = detail.image?.trim();
      const lyrics = extractLyricsFromSummary(detail.summary);
      if (forceRefresh || url !== cachedUrl) {
        setResolvedUrls(prev => ({ ...prev, [article.id]: url }));
      }
      if (cover) {
        setResolvedCovers(prev => (
          prev[article.id] === cover ? prev : { ...prev, [article.id]: cover }
        ));
      }
      if (forceRefresh || !(article.id in resolvedLyrics)) {
        setResolvedLyrics(prev => ({ ...prev, [article.id]: lyrics ?? "" }));
      }
      return url;
    } catch (error) {
      console.error("resolve audio track url failed", error);
      return cachedUrl;
    }
  }, [playlistArticles, channelId, pluginId, pluginMeta, resolvedLyrics, resolvedUrls]);

  const handleTrackChange = (index: number) => {
    const article = playlistArticles[index];
    if (article) {
      onTrackPlay?.(article);
    }
  };

  const handleToggleFavorite = (articleId: string, event: MouseEvent) => {
    const article = articles.find(item => item.id === articleId);
    if (article) {
      onToggleFavorite?.(article, event);
    }
  };

  const handleDownloadTrack = useCallback(async (index: number) => {
    const track = tracks[index];
    if (!track) return;

    let url = track.url.trim();
    if (!url || isPendingAudioTrackUrl(url)) {
      const resolved = await resolveTrackUrl(index, track);
      if (!resolved?.trim()) return;
      url = resolved;
    }

    await downloadAudioTrack(url, track.name);
  }, [resolveTrackUrl, tracks]);

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
            {isPluginFavoritesChannel(channelId) ? "暂无收藏音频" : "当前频道没有可播放的音频"}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {isPluginFavoritesChannel(channelId)
              ? "在其他频道点击爱心即可加入收藏"
              : "切换到其他频道，或刷新订阅源后再试"}
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
        showFavorites={showFavorites}
        favoritedArticleIds={favoritedArticleIds}
        onToggleFavorite={handleToggleFavorite}
        onDownloadTrack={handleDownloadTrack}
      />
    </div>
  );
}
