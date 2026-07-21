import "aplayer/dist/APlayer.min.css";
import "@/styles/orbit-aplayer.css";
import { AudioPlayerHero, AudioTrackList } from "@/components/articleAudioUi";
import { useOrbitAudioPlayer } from "@/hooks/useOrbitAudioPlayer";
import type { ReaderAudioTrack } from "@/components/ReaderAudioPlayer";
import type { MouseEvent } from "react";

interface ChannelAudioPlaylistProps {
  sessionId: string;
  tracks: ReaderAudioTrack[];
  runtimeBase: string | null;
  trackCountLabel?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMoreLabel?: string;
  onLoadMore?: () => void;
  onTrackChange?: (index: number) => void;
  resolveTrackUrl?: (index: number, track: ReaderAudioTrack) => Promise<string | null>;
  className?: string;
  showFavorites?: boolean;
  favoritedArticleIds?: Set<string>;
  onToggleFavorite?: (articleId: string, event: MouseEvent) => void;
  onDownloadTrack?: (index: number) => Promise<void>;
}

export function ChannelAudioPlaylist({
  sessionId,
  tracks,
  runtimeBase,
  trackCountLabel,
  hasMore = false,
  loadingMore = false,
  loadMoreLabel = "加载更多",
  onLoadMore,
  onTrackChange,
  resolveTrackUrl,
  className = "",
  showFavorites = false,
  favoritedArticleIds,
  onToggleFavorite,
  onDownloadTrack,
}: ChannelAudioPlaylistProps) {
  const storageName = `orbit-aplayer-channel-${sessionId}`;
  const player = useOrbitAudioPlayer({
    sessionId,
    tracks,
    storageName,
    preload: "none",
    defaultLoop: "all",
    onTrackChange,
    resolveTrackUrl,
  });

  const { currentTrack } = player;

  if (tracks.length === 0 || !currentTrack) {
    return null;
  }

  return (
    <div className={`orbit-channel-audio flex h-full min-h-0 flex-1 flex-col overflow-hidden w-full ${className}`.trim()}>
      <div ref={player.engineRef} className="orbit-aplayer-engine" aria-hidden="true" />

      <section className="orbit-channel-audio__hero shrink-0 rounded-2xl border border-[var(--orbit-border)] bg-[var(--orbit-surface)]">
        <AudioPlayerHero
          track={currentTrack}
          isPlaying={player.isPlaying}
          currentTime={player.currentTime}
          duration={player.duration}
          currentIndex={player.currentIndex}
          trackCount={tracks.length}
          onTogglePlay={player.handleTogglePlay}
          onPrev={player.handlePrev}
          onNext={player.handleNext}
          onProgressSeek={player.handleProgressSeek}
          timelineStart={player.timelineStart}
          isResolving={player.resolvingIndex === player.currentIndex}
          volume={player.volume}
          playbackRate={player.playbackRate}
          onVolumeChange={player.handleVolumeChange}
          onPlaybackRateStep={player.handlePlaybackRateStep}
          runtimeBase={runtimeBase}
        />
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden pt-4">
        <AudioTrackList
          tracks={tracks}
          currentIndex={player.currentIndex}
          isPlaying={player.isPlaying}
          onSelectTrack={player.switchToIndex}
          playbackMode={player.playbackMode}
          onPlaybackModeChange={player.handlePlaybackModeChange}
          trackCountLabel={trackCountLabel}
          hasMore={hasMore}
          loadingMore={loadingMore}
          loadMoreLabel={loadMoreLabel}
          onLoadMore={onLoadMore}
          fillHeight
          runtimeBase={runtimeBase}
          resolvingIndex={player.resolvingIndex}
          showFavorites={showFavorites}
          favoritedArticleIds={favoritedArticleIds}
          onToggleFavorite={onToggleFavorite}
          onDownloadTrack={onDownloadTrack}
        />
      </section>
    </div>
  );
}
