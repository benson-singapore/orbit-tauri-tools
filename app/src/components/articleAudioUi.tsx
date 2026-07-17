import type { ChangeEvent, MouseEvent } from "react";
import { ProxiedImage } from "@/components/ProxiedImage";
import { formatPlaybackRate } from "@/lib/audioPlaybackPrefs";
import { CHANNEL_PLAYBACK_MODES } from "@/lib/channelPlaybackMode";
import type { ChannelPlaybackMode } from "aplayer";
import type { ReaderAudioTrack } from "@/components/ReaderAudioPlayer";

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function PlayingBars() {
  return (
    <span className="orbit-audio-eq inline-flex h-4 items-end justify-center gap-0.5" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function TrackCover({
  track,
  size,
  runtimeBase,
}: {
  track: ReaderAudioTrack;
  size: "lg" | "sm";
  runtimeBase: string | null;
}) {
  const sizeClass = size === "lg" ? "h-28 w-28 sm:h-32 sm:w-32" : "h-10 w-10";

  if (track.cover?.trim()) {
    return (
      <ProxiedImage
        runtimeBase={runtimeBase}
        src={track.cover}
        alt=""
        className={`${sizeClass} shrink-0 rounded-xl object-cover shadow-sm`}
      />
    );
  }

  return (
    <div className={`${sizeClass} shrink-0 rounded-xl bg-[color-mix(in_srgb,var(--orbit-accent)_12%,transparent)] flex items-center justify-center`}>
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--orbit-accent)]" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"
        />
      </svg>
    </div>
  );
}

function PlaybackModeControls({
  playbackMode,
  onPlaybackModeChange,
}: {
  playbackMode: ChannelPlaybackMode;
  onPlaybackModeChange: (mode: ChannelPlaybackMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="播放模式">
      {CHANNEL_PLAYBACK_MODES.map(mode => {
        const active = playbackMode === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            title={mode.title}
            aria-pressed={active}
            onClick={() => onPlaybackModeChange(mode.id)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
              active
                ? "bg-[color-mix(in_srgb,var(--orbit-accent)_14%,transparent)] text-[var(--orbit-accent)]"
                : "text-[var(--orbit-text-muted)] hover:bg-[color-mix(in_srgb,var(--orbit-text)_5%,transparent)] hover:text-[var(--orbit-text)]"
            }`}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

interface AudioPlayerHeroProps {
  track: ReaderAudioTrack;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentIndex: number;
  trackCount: number;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onProgressClick: (event: MouseEvent<HTMLDivElement>) => void;
  showNavControls?: boolean;
  volume: number;
  playbackRate: number;
  onVolumeChange: (volume: number) => void;
  onPlaybackRateStep: (direction: -1 | 1) => void;
  runtimeBase: string | null;
}

function VolumeIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.06c1.48-.74 2.5-2.26 2.5-4.03zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77 0-4.28-2.99-7.86-7-8.77z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77 0-4.28-2.99-7.86-7-8.77z"
      />
    </svg>
  );
}

function AudioPlaybackTuning({
  volume,
  playbackRate,
  onVolumeChange,
  onPlaybackRateStep,
}: {
  volume: number;
  playbackRate: number;
  onVolumeChange: (volume: number) => void;
  onPlaybackRateStep: (direction: -1 | 1) => void;
}) {
  const volumePercent = Math.round(volume * 100);
  const isMuted = volume <= 0.001;

  const handleVolumeInput = (event: ChangeEvent<HTMLInputElement>) => {
    onVolumeChange(Number.parseInt(event.target.value, 10) / 100);
  };

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[var(--orbit-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="shrink-0 text-[var(--orbit-text-muted)]">
          <VolumeIcon muted={isMuted} />
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volumePercent}
          onChange={handleVolumeInput}
          aria-label="音量"
          className="orbit-audio-volume-slider min-w-0 flex-1"
        />
        <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-[var(--orbit-text-muted)]">
          {volumePercent}%
        </span>
      </label>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <span className="text-[11px] font-medium text-[var(--orbit-text-muted)]">倍速</span>
        <div className="flex items-center rounded-xl border border-[var(--orbit-border)] bg-[color-mix(in_srgb,var(--orbit-surface)_80%,transparent)] p-0.5">
          <button
            type="button"
            onClick={() => onPlaybackRateStep(-1)}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[var(--orbit-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--orbit-text)_6%,transparent)] hover:text-[var(--orbit-text)]"
            aria-label="减慢播放速度"
            title="减慢"
          >
            −
          </button>
          <span className="min-w-[3rem] px-1 text-center text-xs font-semibold tabular-nums text-[var(--orbit-text)]">
            {formatPlaybackRate(playbackRate)}
          </span>
          <button
            type="button"
            onClick={() => onPlaybackRateStep(1)}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[var(--orbit-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--orbit-text)_6%,transparent)] hover:text-[var(--orbit-text)]"
            aria-label="加快播放速度"
            title="加快"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export function AudioPlayerHero({
  track,
  isPlaying,
  currentTime,
  duration,
  currentIndex,
  trackCount,
  onTogglePlay,
  onPrev,
  onNext,
  onProgressClick,
  showNavControls = true,
  volume,
  playbackRate,
  onVolumeChange,
  onPlaybackRateStep,
  runtimeBase,
}: AudioPlayerHeroProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <TrackCover track={track} size="lg" runtimeBase={runtimeBase} />

      <div className="min-w-0 flex-1">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--orbit-text-muted)]">
            正在播放 {currentIndex + 1} / {trackCount}
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold text-[var(--orbit-text)] sm:text-xl">
            {track.name}
          </h2>
          {track.artist ? (
            <p className="mt-0.5 truncate text-sm text-[var(--orbit-text-muted)]">{track.artist}</p>
          ) : null}
        </div>

        <div className="mt-4 space-y-2">
          <div
            role="slider"
            aria-label="播放进度"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            className="group relative h-1.5 cursor-pointer rounded-full bg-[color-mix(in_srgb,var(--orbit-text)_10%,transparent)]"
            onClick={onProgressClick}
          >
            <div
              className="h-full rounded-full bg-[var(--orbit-accent)] transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] tabular-nums text-[var(--orbit-text-muted)]">
            <span>{formatAudioTime(currentTime)}</span>
            <span>{formatAudioTime(duration)}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          {showNavControls ? (
            <button
              type="button"
              onClick={onPrev}
              disabled={trackCount <= 1}
              className="rounded-xl p-2 text-[var(--orbit-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--orbit-text)_6%,transparent)] hover:text-[var(--orbit-text)] disabled:opacity-30"
              aria-label="上一曲"
              title="上一曲"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path fill="currentColor" d="M6 6h2v12H6V6zM9.5 12L18 18V6z" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--orbit-accent)] text-white shadow-sm transition-transform hover:scale-105"
            aria-label={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-0.5" aria-hidden="true">
                <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
              </svg>
            )}
          </button>
          {showNavControls ? (
            <button
              type="button"
              onClick={onNext}
              disabled={trackCount <= 1}
              className="rounded-xl p-2 text-[var(--orbit-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--orbit-text)_6%,transparent)] hover:text-[var(--orbit-text)] disabled:opacity-30"
              aria-label="下一曲"
              title="下一曲"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z" />
              </svg>
            </button>
          ) : null}
        </div>

        <AudioPlaybackTuning
          volume={volume}
          playbackRate={playbackRate}
          onVolumeChange={onVolumeChange}
          onPlaybackRateStep={onPlaybackRateStep}
        />
      </div>
    </div>
  );
}

interface AudioTrackListProps {
  tracks: ReaderAudioTrack[];
  currentIndex: number;
  isPlaying: boolean;
  onSelectTrack: (index: number) => void;
  playbackMode?: ChannelPlaybackMode;
  onPlaybackModeChange?: (mode: ChannelPlaybackMode) => void;
  trackCountLabel?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMoreLabel?: string;
  onLoadMore?: () => void;
  fillHeight?: boolean;
  runtimeBase: string | null;
}

export function AudioTrackList({
  tracks,
  currentIndex,
  isPlaying,
  onSelectTrack,
  playbackMode,
  onPlaybackModeChange,
  trackCountLabel,
  hasMore = false,
  loadingMore = false,
  loadMoreLabel = "加载更多",
  onLoadMore,
  fillHeight = false,
  runtimeBase,
}: AudioTrackListProps) {
  const showPlaybackModes = playbackMode !== undefined && onPlaybackModeChange !== undefined;

  return (
    <div className={fillHeight ? "flex min-h-0 flex-1 flex-col overflow-hidden" : undefined}>
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-0.5">
        <h3 className="text-sm font-semibold text-[var(--orbit-text)]">播放列表</h3>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {showPlaybackModes ? (
            <PlaybackModeControls
              playbackMode={playbackMode}
              onPlaybackModeChange={onPlaybackModeChange}
            />
          ) : null}
          {trackCountLabel ? (
            <span className="shrink-0 text-xs text-[var(--orbit-text-muted)]">{trackCountLabel}</span>
          ) : null}
        </div>
      </div>

      <div className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--orbit-border)] bg-[color-mix(in_srgb,var(--orbit-surface)_70%,transparent)]${fillHeight ? " min-h-0 flex-1" : ""}`}>
        <ol className={`min-h-0 divide-y divide-[var(--orbit-border)] overflow-y-auto overscroll-contain${fillHeight ? " flex-1" : " max-h-72"}`}>
          {tracks.map((track, index) => {
            const isActive = index === currentIndex;
            const isActivePlaying = isActive && isPlaying;

            return (
              <li key={`${track.url}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSelectTrack(index)}
                  className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors sm:px-4 ${
                    isActive
                      ? "bg-[color-mix(in_srgb,var(--orbit-accent)_10%,transparent)]"
                      : "hover:bg-[color-mix(in_srgb,var(--orbit-text)_4%,transparent)]"
                  }`}
                >
                  <span className={`w-6 shrink-0 text-center text-xs tabular-nums ${
                    isActive ? "text-[var(--orbit-accent)] font-semibold" : "text-[var(--orbit-text-muted)]"
                  }`}>
                    {isActivePlaying ? <PlayingBars /> : index + 1}
                  </span>

                  <TrackCover track={track} size="sm" runtimeBase={runtimeBase} />

                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${
                      isActive ? "font-semibold text-[var(--orbit-accent)]" : "text-[var(--orbit-text)]"
                    }`}>
                      {track.name}
                    </span>
                    {track.artist ? (
                      <span className="mt-0.5 block truncate text-xs text-[var(--orbit-text-muted)]">
                        {track.artist}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}

          {hasMore && onLoadMore ? (
            <li className="p-2.5">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="w-full rounded-xl border border-[var(--orbit-border)] py-2.5 text-sm font-medium text-[var(--orbit-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--orbit-text)_4%,transparent)] hover:text-[var(--orbit-text)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? "加载中…" : loadMoreLabel}
              </button>
            </li>
          ) : null}
        </ol>
      </div>
    </div>
  );
}
