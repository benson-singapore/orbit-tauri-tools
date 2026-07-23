import { useMemo } from "react";
import "aplayer/dist/APlayer.min.css";
import "@/styles/orbit-aplayer.css";
import { AudioPlayerHero } from "@/components/articleAudioUi";
import { useOrbitAudioPlayer } from "@/hooks/useOrbitAudioPlayer";
import { extractLyricsFromSummary } from "@/lib/audioLyrics";
import type { Article } from "@/types";

export const READER_AUDIO_SELECTOR = "audio[data-orbit-reader-audio]";

export interface ReaderAudioTrack {
  name: string;
  artist?: string;
  url: string;
  cover?: string;
  lrc?: string;
  summary?: string;
  articleId?: string;
}

interface ReaderAudioPlayerProps {
  sessionId: string;
  article: Article;
  audioUrl: string;
  runtimeBase: string | null;
  playlist?: ReaderAudioTrack[];
  coverImage?: string;
  className?: string;
}

function withResolvedCover(
  track: ReaderAudioTrack,
  coverImage?: string,
): ReaderAudioTrack {
  const cover = track.cover?.trim() || coverImage?.trim();
  return cover ? { ...track, cover } : track;
}

export function ReaderAudioPlayer({
  sessionId,
  article,
  audioUrl,
  runtimeBase,
  playlist,
  coverImage,
  className = "",
}: ReaderAudioPlayerProps) {
  const tracks = useMemo(() => {
    if (playlist && playlist.length > 0) {
      return playlist.map(track => withResolvedCover(track, coverImage));
    }
    return [{
      name: article.title,
      artist: article.author || undefined,
      url: audioUrl,
      cover: coverImage?.trim() || article.image?.trim() || undefined,
      lrc: extractLyricsFromSummary(article.summary),
      summary: article.summary?.trim() || undefined,
    }];
  }, [article.title, article.author, article.image, article.summary, audioUrl, coverImage, playlist]);

  const storageName = `orbit-aplayer-${sessionId}`;
  const player = useOrbitAudioPlayer({
    sessionId,
    tracks,
    storageName,
    preload: "metadata",
    defaultLoop: tracks.length > 1 ? "all" : "none",
  });

  const { currentTrack, hasMultipleTracks } = player;

  if (!currentTrack) {
    return null;
  }

  return (
    <div className={`orbit-reader-audio w-full ${className}`.trim()}>
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
          showNavControls={hasMultipleTracks}
          volume={player.volume}
          playbackRate={player.playbackRate}
          onVolumeChange={player.handleVolumeChange}
          onPlaybackRateStep={player.handlePlaybackRateStep}
          runtimeBase={runtimeBase}
        />
      </section>
    </div>
  );
}
