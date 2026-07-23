import { useMemo } from "react";
import { getAudioFocusPlaybackCache } from "@/lib/audioFocusPlaybackCache";
import { getAudioFocusPlaybackSessionId } from "@/lib/autoDockPlayback";
import type { AudioFocusPlaybackResume } from "@/lib/readerSessions";
import type { ReaderSession } from "@/lib/readerSessions";
import type { Article, Plugin } from "@/types";

export type AudioFocusHostLayout = "inline" | "docked" | "expanded";

export interface AudioFocusHost {
  sessionId: string;
  layout: AudioFocusHostLayout;
  pluginId: string;
  channelId: string;
  articles: Article[];
  pluginMeta?: Plugin | null;
  playbackResume?: AudioFocusPlaybackResume;
  resolvedUrls?: Record<string, string>;
  resolvedCovers?: Record<string, string>;
  resolvedLyrics?: Record<string, string>;
  resolvedSummaries?: Record<string, string>;
  playlistOrder?: string[];
  dockSessionId?: string;
}

function buildDockHost(
  dockSession: ReaderSession,
  pluginMeta?: Plugin | null,
): AudioFocusHost {
  const dock = dockSession.audioFocusDock!;
  const sessionId = getAudioFocusPlaybackSessionId(dock.pluginId, dock.channelId);
  const cache = getAudioFocusPlaybackCache(sessionId);

  return {
    sessionId,
    layout: dockSession.mode === "expanded" ? "expanded" : "docked",
    pluginId: dock.pluginId,
    channelId: dock.channelId,
    articles: dock.articles,
    pluginMeta,
    playbackResume: {
      trackIndex: cache?.currentIndex ?? dock.playbackResume?.trackIndex ?? 0,
      currentTime: cache?.currentTime ?? dock.playbackResume?.currentTime ?? 0,
      playing: cache?.isPlaying ?? dock.playbackResume?.playing ?? false,
    },
    resolvedUrls: cache?.resolvedUrls ?? dock.resolvedUrls,
    resolvedCovers: cache?.resolvedCovers ?? dock.resolvedCovers,
    resolvedLyrics: cache?.resolvedLyrics ?? dock.resolvedLyrics,
    resolvedSummaries: cache?.resolvedSummaries ?? dock.resolvedSummaries,
    playlistOrder: cache?.playlistOrder ?? dock.playlistOrder,
    dockSessionId: dockSession.id,
  };
}

export function useAudioFocusHost(input: {
  isAudioFocusPreviewMode: boolean;
  activePlugin: string;
  activeChannel: string;
  pluginFeedArticles: Article[];
  activePluginMeta?: Plugin | null;
  readerSessions: ReaderSession[];
  pluginById: Map<string, Plugin>;
}): AudioFocusHost | null {
  const {
    isAudioFocusPreviewMode,
    activePlugin,
    activeChannel,
    pluginFeedArticles,
    activePluginMeta,
    readerSessions,
    pluginById,
  } = input;

  return useMemo(() => {
    const dockSession = readerSessions.find(session => session.audioFocusDock);
    const dock = dockSession?.audioFocusDock;
    const inlineActive = isAudioFocusPreviewMode && activePlugin !== "all";

    // Background dock for another plugin takes priority — keeps one player mounted.
    if (dock && inlineActive && activePlugin !== dock.pluginId) {
      return buildDockHost(dockSession!, pluginById.get(dock.pluginId));
    }

    if (inlineActive) {
      const sessionId = getAudioFocusPlaybackSessionId(activePlugin, activeChannel);
      const matchingDock = readerSessions.find(session =>
        session.audioFocusDock?.pluginId === activePlugin
        && session.audioFocusDock?.channelId === activeChannel,
      );
      const dockData = matchingDock?.audioFocusDock;
      const cache = getAudioFocusPlaybackCache(sessionId);

      return {
        sessionId,
        layout: "inline" as const,
        pluginId: activePlugin,
        channelId: activeChannel,
        articles: pluginFeedArticles,
        pluginMeta: activePluginMeta,
        playbackResume: dockData?.playbackResume,
        resolvedUrls: cache?.resolvedUrls ?? dockData?.resolvedUrls,
        resolvedCovers: cache?.resolvedCovers ?? dockData?.resolvedCovers,
        resolvedLyrics: cache?.resolvedLyrics ?? dockData?.resolvedLyrics,
        resolvedSummaries: cache?.resolvedSummaries ?? dockData?.resolvedSummaries,
        playlistOrder: cache?.playlistOrder ?? dockData?.playlistOrder,
        dockSessionId: matchingDock?.id,
      };
    }

    if (dock) {
      return buildDockHost(dockSession!, pluginById.get(dock.pluginId));
    }

    return null;
  }, [
    isAudioFocusPreviewMode,
    activePlugin,
    activeChannel,
    pluginFeedArticles,
    activePluginMeta,
    readerSessions,
    pluginById,
  ]);
}
