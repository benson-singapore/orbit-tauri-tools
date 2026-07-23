import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { FavoriteHeartButton } from "@/components/FavoriteHeartButton";
import { Icon } from "@/components/Icon";
import { ProxiedImage } from "@/components/ProxiedImage";
import { formatPlaybackRate } from "@/lib/audioPlaybackPrefs";
import {
  getActiveLyricIndex,
  getLyricsDisplayLines,
  isLrcLyrics,
  parseLrcLines,
} from "@/lib/audioLyrics";
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
  timelineStart?: number;
  currentIndex: number;
  trackCount: number;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onProgressSeek: (ratio: number) => void;
  showNavControls?: boolean;
  volume: number;
  playbackRate: number;
  onVolumeChange: (volume: number) => void;
  onPlaybackRateStep: (direction: -1 | 1) => void;
  runtimeBase: string | null;
  isResolving?: boolean;
}

function AudioProgressBar({
  currentTime,
  duration,
  timelineStart = 0,
  onProgressSeek,
}: {
  currentTime: number;
  duration: number;
  timelineStart?: number;
  onProgressSeek: (ratio: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const timelineSpan = Math.max(0, duration - timelineStart);
  const displayCurrent = Math.max(0, currentTime - timelineStart);
  const progress = timelineSpan > 0 ? (displayCurrent / timelineSpan) * 100 : 0;

  const seekFromPointer = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onProgressSeek(ratio);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromPointer(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    seekFromPointer(event.clientX);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="mt-3 space-y-1.5">
      <div
        className="cursor-pointer touch-none py-2 -my-2"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          ref={trackRef}
          role="slider"
          aria-label="播放进度"
          aria-valuemin={0}
          aria-valuemax={timelineSpan}
          aria-valuenow={displayCurrent}
          className="relative h-1.5 rounded-full bg-[color-mix(in_srgb,var(--orbit-text)_10%,transparent)]"
        >
          <div
            className="h-full rounded-full bg-[var(--orbit-accent)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] tabular-nums text-[var(--orbit-text-muted)]">
        <span>{formatAudioTime(displayCurrent)}</span>
        <span>{formatAudioTime(timelineSpan)}</span>
      </div>
    </div>
  );
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

function AudioLyricsPanel({
  lrc,
  currentTime,
  popoverContainerRef,
}: {
  lrc: string;
  currentTime: number;
  popoverContainerRef: RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const displayLines = getLyricsDisplayLines(lrc, currentTime, 3);
  const allLines = parseLrcLines(lrc);
  const activeIndex = getActiveLyricIndex(lrc, currentTime);

  useEffect(() => {
    if (!open) return;

    const onDocumentPointerDown = (event: Event) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => document.removeEventListener("mousedown", onDocumentPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0 || !panelRef.current) return;

    const activeElement = panelRef.current.querySelector(`[data-lyric-index="${activeIndex}"]`);
    if (!(activeElement instanceof HTMLElement)) return;

    activeElement.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [open, activeIndex]);

  if (!displayLines || displayLines.length === 0) {
    return null;
  }

  const popover = open && popoverContainerRef.current ? createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="完整歌词"
      className="absolute right-0 top-0 z-50 w-[min(24rem,calc(100vw-2rem))] max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-[var(--orbit-border)] bg-[var(--orbit-surface)] p-3 shadow-lg"
    >
      <div className="space-y-1.5 text-right">
        {allLines.map((line, index) => {
          const isActive = index === activeIndex;
          return (
            <p
              key={`${line.time}-${index}`}
              data-lyric-index={index}
              className={`text-sm leading-relaxed transition-colors ${
                isActive
                  ? "font-semibold text-[var(--orbit-accent)]"
                  : "text-[var(--orbit-text-muted)]"
              } ${line.text ? "" : "min-h-[1.25rem]"}`}
            >
              {line.text || "\u00A0"}
            </p>
          );
        })}
      </div>
    </div>,
    popoverContainerRef.current,
  ) : null;

  return (
    <>
      {popover}
      <div className="relative min-w-0 flex-1 self-start sm:ml-6 sm:border-l sm:border-[var(--orbit-border)] sm:pl-6" ref={rootRef}>
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className="w-full min-w-0 rounded-lg border border-transparent px-1 py-0.5 text-right transition-colors hover:border-[var(--orbit-border)] hover:bg-[color-mix(in_srgb,var(--orbit-text)_3%,transparent)]"
          aria-expanded={open}
          aria-haspopup="dialog"
          title="查看完整歌词"
        >
          <div className="space-y-0 text-right">
            {displayLines.map(line => (
              <p
                key={line.index}
                className={`truncate text-xs leading-5 transition-colors ${
                  line.isActive
                    ? "font-semibold text-[var(--orbit-accent)]"
                    : "text-[var(--orbit-text-muted)]"
                }`}
              >
                {line.text || "\u00A0"}
              </p>
            ))}
          </div>
        </button>
      </div>
    </>
  );
}

function AudioSummaryPanel({ summary }: { summary: string }) {
  return (
    <div className="relative min-w-0 flex-1 self-start sm:ml-6 sm:border-l sm:border-[var(--orbit-border)] sm:pl-6">
      <div className="rounded-lg px-1 py-0.5 text-right">
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--orbit-text-muted)]">
          {summary}
        </p>
      </div>
    </div>
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
    <div className="mt-3 flex flex-col gap-2.5 border-t border-[var(--orbit-border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
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
  timelineStart = 0,
  currentIndex,
  trackCount,
  onTogglePlay,
  onPrev,
  onNext,
  onProgressSeek,
  showNavControls = true,
  volume,
  playbackRate,
  onVolumeChange,
  onPlaybackRateStep,
  runtimeBase,
  isResolving = false,
}: AudioPlayerHeroProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const lyricSource = track.lrc?.trim()
    || (track.summary && isLrcLyrics(track.summary) ? track.summary.trim() : "");
  const plainSummary = track.summary?.trim() && !isLrcLyrics(track.summary)
    ? track.summary.trim()
    : "";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <TrackCover track={track} size="lg" runtimeBase={runtimeBase} />

      <div ref={contentRef} className="relative min-w-0 flex-1">
        <div className="min-w-0 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 shrink-0 sm:max-w-[42%]">
            <p className="text-xs font-medium text-[var(--orbit-text-muted)]">
              正在播放 {currentIndex + 1} / {trackCount}
            </p>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-[var(--orbit-text)] sm:text-xl">
              {track.name}
            </h2>
            {track.artist ? (
              <p className="mt-0.5 truncate text-sm text-[var(--orbit-text-muted)]">{track.artist}</p>
            ) : null}
          </div>
          {lyricSource ? (
            <AudioLyricsPanel
              lrc={lyricSource}
              currentTime={Math.max(0, currentTime - timelineStart)}
              popoverContainerRef={contentRef}
            />
          ) : plainSummary ? (
            <AudioSummaryPanel summary={plainSummary} />
          ) : null}
        </div>

        <AudioProgressBar
          currentTime={currentTime}
          duration={duration}
          timelineStart={timelineStart}
          onProgressSeek={onProgressSeek}
        />

        <div className="mt-3 flex items-center justify-center gap-2">
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
            disabled={isResolving}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--orbit-accent)] text-white shadow-sm transition-transform hover:scale-105 disabled:cursor-wait disabled:opacity-70"
            aria-label={isResolving ? "正在加载音频" : isPlaying ? "暂停" : "播放"}
          >
            {isResolving ? (
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : isPlaying ? (
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
  resolvingIndex?: number | null;
  showFavorites?: boolean;
  favoritedArticleIds?: Set<string>;
  onToggleFavorite?: (articleId: string, event: MouseEvent) => void;
  onDownloadTrack?: (index: number) => Promise<void>;
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
  resolvingIndex = null,
  showFavorites = false,
  favoritedArticleIds,
  onToggleFavorite,
  onDownloadTrack,
}: AudioTrackListProps) {
  const showPlaybackModes = playbackMode !== undefined && onPlaybackModeChange !== undefined;
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);

  const handleDownloadTrack = async (index: number, event: MouseEvent) => {
    event.stopPropagation();
    if (!onDownloadTrack || downloadingIndex !== null) return;

    setDownloadingIndex(index);
    try {
      await onDownloadTrack(index);
    } catch (error) {
      console.error("download audio track failed", error);
    } finally {
      setDownloadingIndex(null);
    }
  };

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
            const isResolving = resolvingIndex === index;
            const articleId = track.articleId;
            const favorited = Boolean(articleId && favoritedArticleIds?.has(articleId));

            return (
              <li
                key={`${articleId ?? track.name}-${index}`}
                data-orbit-audio-track-index={index}
                data-orbit-audio-track-active={isActive ? "true" : undefined}
              >
                <div
                  className={`flex w-full items-center gap-1 px-1 py-1 sm:px-2 ${
                    isActive
                      ? "bg-[color-mix(in_srgb,var(--orbit-accent)_10%,transparent)]"
                      : "hover:bg-[color-mix(in_srgb,var(--orbit-text)_4%,transparent)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectTrack(index)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left transition-colors sm:px-2"
                  >
                    <span className={`w-6 shrink-0 text-center text-xs tabular-nums ${
                      isActive ? "text-[var(--orbit-accent)] font-semibold" : "text-[var(--orbit-text-muted)]"
                    }`}>
                      {isResolving ? (
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--orbit-accent)]/30 border-t-[var(--orbit-accent)]" />
                      ) : isActivePlaying ? <PlayingBars /> : index + 1}
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

                  {showFavorites && articleId && onToggleFavorite ? (
                    <FavoriteHeartButton
                      favorited={favorited}
                      onToggle={(event) => onToggleFavorite(articleId, event)}
                      className="shrink-0 rounded-full p-2 text-[var(--orbit-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--orbit-text)_6%,transparent)] hover:text-rose-500"
                      iconClassName="h-4 w-4"
                    />
                  ) : null}

                  {onDownloadTrack ? (
                    <button
                      type="button"
                      onClick={(event) => void handleDownloadTrack(index, event)}
                      disabled={downloadingIndex === index || isResolving}
                      className="shrink-0 rounded-full p-2 text-[var(--orbit-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--orbit-text)_6%,transparent)] hover:text-[var(--orbit-text)] disabled:cursor-not-allowed disabled:opacity-50"
                      title="下载音频"
                      aria-label="下载音频"
                    >
                      <Icon
                        name="download"
                        className={`h-4 w-4${downloadingIndex === index ? " animate-pulse" : ""}`}
                      />
                    </button>
                  ) : null}
                </div>
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
