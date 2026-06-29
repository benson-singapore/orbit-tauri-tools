import "aplayer/dist/APlayer.min.css";
import "@/styles/orbit-aplayer.css";
import { AudioPlayerHero, AudioTrackList } from "@/components/articleAudioUi";
import { useOrbitAudioPlayer } from "@/hooks/useOrbitAudioPlayer";
import type { ReaderAudioTrack } from "@/components/ReaderAudioPlayer";

interface ChannelAudioPlaylistProps {
  sessionId: string;
  tracks: ReaderAudioTrack[];
  trackCountLabel?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMoreLabel?: string;
  onLoadMore?: () => void;
  onTrackChange?: (index: number) => void;
  className?: string;
}

export function ChannelAudioPlaylist({
  sessionId,
  tracks,
  trackCountLabel,
  hasMore = false,
  loadingMore = false,
  loadMoreLabel = "加载更多",
  onLoadMore,
  onTrackChange,
  className = "",
}: ChannelAudioPlaylistProps) {
  const storageName = `orbit-aplayer-channel-${sessionId}`;
  const player = useOrbitAudioPlayer({
    sessionId,
    tracks,
    storageName,
    preload: "none",
    defaultLoop: "all",
    onTrackChange,
  });

  const { currentTrack } = player;

  if (tracks.length === 0 || !currentTrack) {
    return null;
  }

  return (
    <div className={`orbit-channel-audio flex h-full min-h-0 flex-1 flex-col overflow-hidden w-full ${className}`.trim()}>
      <div ref={player.engineRef} className="orbit-aplayer-engine" aria-hidden="true" />

      <section className="orbit-channel-audio__hero shrink-0 rounded-2xl border border-[var(--orbit-border)] bg-[var(--orbit-surface)] pb-5">
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
          onProgressClick={player.handleProgressClick}
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
        />
      </section>
    </div>
  );
}
