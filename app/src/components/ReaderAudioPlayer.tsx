import { useMemo } from "react";
import "aplayer/dist/APlayer.min.css";
import "@/styles/orbit-aplayer.css";
import { AudioPlayerHero } from "@/components/articleAudioUi";
import { useOrbitAudioPlayer } from "@/hooks/useOrbitAudioPlayer";
import { displayImageUrl } from "@/lib/imageProxy";
import type { Article } from "@/types";

export const READER_AUDIO_SELECTOR = "audio[data-orbit-reader-audio]";

export interface ReaderAudioTrack {
  name: string;
  artist?: string;
  url: string;
  cover?: string;
  lrc?: string;
}

interface ReaderAudioPlayerProps {
  sessionId: string;
  article: Article;
  audioUrl: string;
  runtimeBase: string | null;
  playlist?: ReaderAudioTrack[];
  className?: string;
}

export function ReaderAudioPlayer({
  sessionId,
  article,
  audioUrl,
  runtimeBase,
  playlist,
  className = "",
}: ReaderAudioPlayerProps) {
  const tracks = useMemo(() => {
    if (playlist && playlist.length > 0) {
      return playlist;
    }
    return [{
      name: article.title,
      artist: article.author || undefined,
      url: audioUrl,
      cover: article.image ? displayImageUrl(runtimeBase, article.image) : undefined,
    }];
  }, [article.title, article.author, article.image, audioUrl, runtimeBase, playlist]);

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
          showNavControls={hasMultipleTracks}
        />
      </section>
    </div>
  );
}
