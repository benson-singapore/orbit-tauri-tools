import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
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
import type { ReaderAudioTrack } from "@/components/ReaderAudioPlayer";

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
  playbackMode: ChannelPlaybackMode;
  hasMultipleTracks: boolean;
  handlePlaybackModeChange: (mode: ChannelPlaybackMode) => void;
  handleTogglePlay: () => void;
  handlePrev: () => void;
  handleNext: () => void;
  handleProgressClick: (event: MouseEvent<HTMLDivElement>) => void;
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

  const applyTrackIndex = useCallback((index: number) => {
    if (index < 0 || index >= tracksLengthRef.current) return;
    setCurrentIndex(index);
    setCurrentTime(0);
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

  useEffect(() => {
    const container = engineRef.current;
    if (!container || tracks.length === 0) return;

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
    player.skipForward = () => {
      if (player.audio.paused && !userNavigatingRef.current && !player.audio.ended) return;
      originalSkipForward();
    };
    playerRef.current = player;
    syncedTrackCountRef.current = tracks.length;

    const onTimeUpdate = () => {
      setCurrentTime(player.audio.currentTime);
      setDuration(player.audio.duration || 0);
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
      setDuration(player.audio.duration || 0);
      restorePlaybackSnapshot();
    };
    const onListsSwitch = (...args: unknown[]) => {
      const detail = args[0] as { index?: number } | undefined;
      const index = detail?.index ?? player.list.index ?? 0;
      applyTrackIndex(index);
      userNavigatingRef.current = false;
    };

    player.on("timeupdate", onTimeUpdate);
    player.on("play", onPlay);
    player.on("pause", onPause);
    player.on("loadedmetadata", onLoadedMetadata);
    player.on("listswitch", onListsSwitch);
    player.on("ended", onPause);

    if (player.audio.readyState >= 1) {
      setDuration(player.audio.duration || 0);
      restorePlaybackSnapshot();
    }

    return () => {
      player.destroy();
      playerRef.current = null;
      syncedTrackCountRef.current = 0;
      setCurrentIndex(0);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    };
  }, [
    sessionId,
    storageName,
    preload,
    defaultLoop,
    tracks,
    hasMultipleTracks,
    syncPlaybackSnapshot,
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

  const handleProgressClick = (event: MouseEvent<HTMLDivElement>) => {
    const player = playerRef.current;
    if (!player || duration <= 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    player.seek(ratio * duration);
    setCurrentTime(ratio * duration);
  };

  return {
    engineRef,
    currentIndex,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    playbackMode,
    hasMultipleTracks,
    handlePlaybackModeChange,
    handleTogglePlay,
    handlePrev,
    handleNext,
    handleProgressClick,
    switchToIndex,
    volume,
    playbackRate,
    handleVolumeChange,
    handlePlaybackRateStep,
  };
}
