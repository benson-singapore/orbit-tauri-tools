import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import APlayer from "aplayer";
import Hls from "hls.js";
import { isHlsAudioUrl } from "@/lib/articleAudioUrl";
import {
  persistAudioVolume,
  persistPlaybackRate,
  readStoredAudioVolume,
  readStoredPlaybackRate,
  stepPlaybackRate,
} from "@/lib/audioPlaybackPrefs";
import {
  applyChannelPlaybackMode,
  persistChannelPlaybackMode,
  readStoredChannelPlaybackMode,
  shuffleOrder,
} from "@/lib/channelPlaybackMode";
import {
  getSessionPlaybackSnapshot,
  PLAYBACK_RESUME_EVENT,
  type PlaybackResumeEventDetail,
  updateSessionPlaybackSnapshot,
} from "@/lib/sessionVideoProgress";
import type { APlayerAudioItem, ChannelPlaybackMode } from "aplayer";
import {
  resolveAudioTimeline,
  seekTimeFromRatio,
  timelineSpan,
} from "@/lib/audioTimeline";
import type { ReaderAudioTrack } from "@/components/ReaderAudioPlayer";

const AUDIO_SEEK_STEP_SECONDS = 15;

export interface UseOrbitAudioPlayerOptions {
  sessionId: string;
  tracks: ReaderAudioTrack[];
  storageName: string;
  preload?: "none" | "metadata" | "auto";
  defaultLoop?: "all" | "one" | "none";
  onTrackChange?: (index: number) => void;
}

export interface UseOrbitAudioPlayerResult {
  engineRef: RefObject<HTMLDivElement | null>;
  currentIndex: number;
  currentTrack: ReaderAudioTrack | undefined;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  timelineStart: number;
  handleProgressSeek: (ratio: number) => void;
  playbackMode: ChannelPlaybackMode;
  hasMultipleTracks: boolean;
  handlePlaybackModeChange: (mode: ChannelPlaybackMode) => void;
  handleTogglePlay: () => void;
  handlePrev: () => void;
  handleNext: () => void;
  switchToIndex: (index: number) => void;
  volume: number;
  playbackRate: number;
  handleVolumeChange: (volume: number) => void;
  handlePlaybackRateStep: (direction: -1 | 1) => void;
}

function readOrbitAccentColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--orbit-accent").trim();
  return value || "#6366f1";
}

function ensureAPlayerHlsGlobal(): void {
  const globalWindow = window as Window & { Hls?: typeof Hls };
  if (!globalWindow.Hls) {
    globalWindow.Hls = Hls;
  }
}

export function toAPlayerItem(track: ReaderAudioTrack): APlayerAudioItem {
  return {
    name: track.name,
    artist: track.artist,
    url: track.url,
    cover: track.cover,
    lrc: track.lrc,
    type: isHlsAudioUrl(track.url) ? "hls" : "auto",
  };
}

export function useOrbitAudioPlayer({
  sessionId,
  tracks,
  storageName,
  preload = "metadata",
  defaultLoop = "all",
  onTrackChange,
}: UseOrbitAudioPlayerOptions): UseOrbitAudioPlayerResult {
  const engineRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<APlayer | null>(null);
  const syncedTrackCountRef = useRef(0);
  const tracksLengthRef = useRef(tracks.length);
  const userNavigatingRef = useRef(false);
  const userSeekingRef = useRef(false);
  const initialRestoreDoneRef = useRef(false);
  const onTrackChangeRef = useRef(onTrackChange);
  const playbackModeRef = useRef<ChannelPlaybackMode>(
    readStoredChannelPlaybackMode(storageName),
  );

  onTrackChangeRef.current = onTrackChange;
  tracksLengthRef.current = tracks.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [timelineStart, setTimelineStart] = useState(0);
  const [playbackMode, setPlaybackMode] = useState<ChannelPlaybackMode>(
    () => readStoredChannelPlaybackMode(storageName),
  );
  const [volume, setVolume] = useState(() => readStoredAudioVolume());
  const [playbackRate, setPlaybackRate] = useState(() => readStoredPlaybackRate());

  const hasMultipleTracks = tracks.length > 1;
  const currentTrack = tracks[currentIndex] ?? tracks[0];
  playbackModeRef.current = playbackMode;

  const syncPlaybackSnapshot = useCallback((audio: HTMLAudioElement) => {
    updateSessionPlaybackSnapshot(sessionId, {
      currentTime: audio.currentTime,
      playing: !audio.paused,
    });
  }, [sessionId]);

  const syncTimeline = useCallback((audio: HTMLAudioElement) => {
    const timeline = resolveAudioTimeline(audio);
    setTimelineStart(timeline.start);
    setDuration(timeline.end);
  }, []);

  const restorePlaybackSnapshot = useCallback((position?: number) => {
    const player = playerRef.current;
    if (!player) return;

    const target = position ?? getSessionPlaybackSnapshot(sessionId)?.currentTime ?? 0;
    if (target <= 0.5) return;

    try {
      player.seek(target);
    } catch {
      // Ignore seek before metadata is ready.
    }

    const snapshot = getSessionPlaybackSnapshot(sessionId);
    if (snapshot?.playing) {
      void player.audio.play().catch(() => {});
    }
  }, [sessionId]);

  const applyTrackIndex = useCallback((index: number, previousIndex?: number) => {
    if (index < 0 || index >= tracksLengthRef.current) return;
    const switchedTrack = previousIndex !== undefined && previousIndex !== index;
    setCurrentIndex(index);
    if (switchedTrack) {
      setCurrentTime(0);
    } else {
      const player = playerRef.current;
      if (player) {
        setCurrentTime(player.audio.currentTime);
      }
    }
    const player = playerRef.current;
    if (player) {
      setDuration(player.audio.duration || 0);
    }
    onTrackChangeRef.current?.(index);
  }, []);

  const switchToIndex = useCallback((index: number) => {
    const player = playerRef.current;
    if (!player || index < 0 || index >= tracksLengthRef.current) return;
    userNavigatingRef.current = true;
    player.list.switch(index);
    applyTrackIndex(index);
  }, [applyTrackIndex]);

  const handlePlaybackModeChange = useCallback((mode: ChannelPlaybackMode) => {
    setPlaybackMode(mode);
    playbackModeRef.current = mode;
    persistChannelPlaybackMode(storageName, mode);

    const player = playerRef.current;
    if (!player) return;
    applyChannelPlaybackMode(player, mode);
  }, [storageName]);

  const handleVolumeChange = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    setVolume(clamped);
    persistAudioVolume(clamped);
    const player = playerRef.current;
    if (player) {
      player.audio.volume = clamped;
    }
  }, []);

  const handlePlaybackRateStep = useCallback((direction: -1 | 1) => {
    setPlaybackRate(prev => {
      const next = stepPlaybackRate(prev, direction);
      persistPlaybackRate(next);
      const player = playerRef.current;
      if (player) {
        player.audio.playbackRate = next;
      }
      return next;
    });
  }, []);

  const tracksSignature = useMemo(
    () => tracks.map(track => `${track.url}\u0000${track.name}\u0000${track.artist ?? ""}`).join("\n"),
    [tracks],
  );

  useEffect(() => {
    const container = engineRef.current;
    if (!container || tracks.length === 0) return;

    initialRestoreDoneRef.current = false;
    ensureAPlayerHlsGlobal();
    const initialMode = readStoredChannelPlaybackMode(storageName);
    playbackModeRef.current = initialMode;
    setPlaybackMode(initialMode);

    const player = new APlayer({
      container,
      theme: readOrbitAccentColor(),
      preload,
      mutex: true,
      loop: hasMultipleTracks ? defaultLoop : "none",
      order: "list",
      listFolded: true,
      listMaxHeight: 0,
      storageName,
      audio: tracks.map(toAPlayerItem),
    });

    if (hasMultipleTracks) {
      applyChannelPlaybackMode(player, initialMode);
    }

    player.audio.dataset.orbitReaderAudio = "true";
    player.audio.volume = readStoredAudioVolume();
    player.audio.playbackRate = readStoredPlaybackRate();
    const originalSkipForward = player.skipForward.bind(player);
    const originalSkipBack = player.skipBack.bind(player);
    const seekByOffset = (offsetSeconds: number) => {
      const timeline = resolveAudioTimeline(player.audio);
      const span = timelineSpan(timeline);
      if (span <= 0) return;
      const target = Math.max(
        timeline.start,
        Math.min(timeline.end, player.audio.currentTime + offsetSeconds),
      );
      userSeekingRef.current = true;
      player.seek(target);
      setCurrentTime(target);
      syncPlaybackSnapshot(player.audio);
    };
    player.skipForward = () => {
      if (player.list.audios.length <= 1) {
        seekByOffset(AUDIO_SEEK_STEP_SECONDS);
        return;
      }
      if (player.audio.paused && !userNavigatingRef.current && !player.audio.ended) return;
      originalSkipForward();
    };
    player.skipBack = () => {
      if (player.list.audios.length <= 1) {
        seekByOffset(-AUDIO_SEEK_STEP_SECONDS);
        return;
      }
      originalSkipBack();
    };
    playerRef.current = player;
    syncedTrackCountRef.current = tracks.length;

    const onTimeUpdate = () => {
      setCurrentTime(player.audio.currentTime);
      syncTimeline(player.audio);
      syncPlaybackSnapshot(player.audio);
    };
    const onPlay = () => {
      setIsPlaying(true);
      syncPlaybackSnapshot(player.audio);
    };
    const onPause = () => {
      setIsPlaying(false);
      syncPlaybackSnapshot(player.audio);
    };
    const onLoadedMetadata = () => {
      syncTimeline(player.audio);
      if (userSeekingRef.current || initialRestoreDoneRef.current) return;
      restorePlaybackSnapshot();
      initialRestoreDoneRef.current = true;
    };
    const onTimelineChange = () => {
      syncTimeline(player.audio);
    };
    const onSeeked = () => {
      userSeekingRef.current = false;
    };
    const onListsSwitch = (...args: unknown[]) => {
      const detail = args[0] as { index?: number } | undefined;
      const previousIndex = player.list.index;
      const index = detail?.index ?? previousIndex;
      applyTrackIndex(index, previousIndex);
      userNavigatingRef.current = false;
    };

    player.on("timeupdate", onTimeUpdate);
    player.on("play", onPlay);
    player.on("pause", onPause);
    player.on("loadedmetadata", onLoadedMetadata);
    player.on("listswitch", onListsSwitch);
    player.on("ended", onPause);
    player.audio.addEventListener("durationchange", onTimelineChange);
    player.audio.addEventListener("progress", onTimelineChange);
    player.audio.addEventListener("seeked", onSeeked);

    if (player.audio.readyState >= 1) {
      syncTimeline(player.audio);
      if (!initialRestoreDoneRef.current) {
        restorePlaybackSnapshot();
        initialRestoreDoneRef.current = true;
      }
    }

    return () => {
      player.audio.removeEventListener("durationchange", onTimelineChange);
      player.audio.removeEventListener("progress", onTimelineChange);
      player.audio.removeEventListener("seeked", onSeeked);
      player.destroy();
      playerRef.current = null;
      syncedTrackCountRef.current = 0;
      setCurrentIndex(0);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setTimelineStart(0);
    };
  }, [
    sessionId,
    storageName,
    preload,
    defaultLoop,
    tracksSignature,
    hasMultipleTracks,
    syncPlaybackSnapshot,
    syncTimeline,
    restorePlaybackSnapshot,
    applyTrackIndex,
  ]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const synced = syncedTrackCountRef.current;
    if (tracks.length <= synced) return;

    player.list.add(tracks.slice(synced).map(toAPlayerItem));
    syncedTrackCountRef.current = tracks.length;

    if (playbackModeRef.current === "shuffle") {
      player.randomOrder = shuffleOrder(player.list.audios.length);
    }
  }, [tracks]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    player.audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    player.audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    if (currentIndex >= tracks.length && tracks.length > 0) {
      setCurrentIndex(0);
    }
  }, [currentIndex, tracks.length]);

  useEffect(() => {
    const onResume = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackResumeEventDetail>).detail;
      if (detail.sessionId !== sessionId) return;
      restorePlaybackSnapshot(detail.position);
    };

    window.addEventListener(PLAYBACK_RESUME_EVENT, onResume);
    return () => window.removeEventListener(PLAYBACK_RESUME_EVENT, onResume);
  }, [sessionId, restorePlaybackSnapshot]);

  const handleTogglePlay = () => {
    playerRef.current?.toggle();
  };

  const handlePrev = () => {
    if (!hasMultipleTracks) return;
    userNavigatingRef.current = true;
    playerRef.current?.skipBack();
  };

  const handleNext = () => {
    if (!hasMultipleTracks) return;
    userNavigatingRef.current = true;
    playerRef.current?.skipForward();
  };

  const handleProgressSeek = useCallback((ratio: number) => {
    const player = playerRef.current;
    if (!player) return;

    const target = seekTimeFromRatio(ratio, resolveAudioTimeline(player.audio));
    if (target == null) return;

    userSeekingRef.current = true;
    player.seek(target);
    setCurrentTime(target);
    syncPlaybackSnapshot(player.audio);
  }, [syncPlaybackSnapshot]);

  return {
    engineRef,
    currentIndex,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    timelineStart,
    handleProgressSeek,
    playbackMode,
    hasMultipleTracks,
    handlePlaybackModeChange,
    handleTogglePlay,
    handlePrev,
    handleNext,
    switchToIndex,
    volume,
    playbackRate,
    handleVolumeChange,
    handlePlaybackRateStep,
  };
}
