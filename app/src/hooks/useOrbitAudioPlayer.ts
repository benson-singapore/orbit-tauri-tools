import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import APlayer from "aplayer";
import Hls from "hls.js";
import { isHlsAudioUrl, isPendingAudioTrackUrl } from "@/lib/articleAudioUrl";
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

export interface ResolveTrackUrlOptions {
  forceRefresh?: boolean;
}

export interface UseOrbitAudioPlayerOptions {
  sessionId: string;
  tracks: ReaderAudioTrack[];
  storageName: string;
  preload?: "none" | "metadata" | "auto";
  defaultLoop?: "all" | "one" | "none";
  onTrackChange?: (index: number) => void;
  resolveTrackUrl?: (
    index: number,
    track: ReaderAudioTrack,
    options?: ResolveTrackUrlOptions,
  ) => Promise<string | null>;
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
  resolvingIndex: number | null;
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

function trackIdentityKey(track: ReaderAudioTrack): string {
  return `${track.articleId ?? track.name}\u0000${track.name}\u0000${track.artist ?? ""}`;
}

/** True when `next` is the same list or a pure append of `prev` (load-more). */
function isTrackListAppendOrSame(prev: string, next: string): boolean {
  if (prev === next) return true;
  if (!prev) return true;
  return next.startsWith(prev) && next.charAt(prev.length) === "\n";
}

export function useOrbitAudioPlayer({
  sessionId,
  tracks,
  storageName,
  preload = "metadata",
  defaultLoop = "all",
  onTrackChange,
  resolveTrackUrl,
}: UseOrbitAudioPlayerOptions): UseOrbitAudioPlayerResult {
  const engineRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<APlayer | null>(null);
  const syncedTrackCountRef = useRef(0);
  const tracksLengthRef = useRef(tracks.length);
  const tracksRef = useRef(tracks);
  const resolveTrackUrlRef = useRef(resolveTrackUrl);
  const userNavigatingRef = useRef(false);
  const userSeekingRef = useRef(false);
  const initialRestoreDoneRef = useRef(false);
  const onTrackChangeRef = useRef(onTrackChange);
  const playbackModeRef = useRef<ChannelPlaybackMode>(
    readStoredChannelPlaybackMode(storageName),
  );

  onTrackChangeRef.current = onTrackChange;
  resolveTrackUrlRef.current = resolveTrackUrl;
  tracksLengthRef.current = tracks.length;
  tracksRef.current = tracks;

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
  const [resolvingIndex, setResolvingIndex] = useState<number | null>(null);

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

  const applyTrackUrlToPlayer = useCallback((index: number, url: string) => {
    const player = playerRef.current;
    if (!player || index < 0 || index >= player.list.audios.length) return;

    const audio = player.list.audios[index];
    if (!audio || audio.url === url) return;

    audio.url = url;
    audio.type = isHlsAudioUrl(url) ? "hls" : "auto";

    if (player.list.index === index) {
      player.list.switch(index);
    }
  }, []);

  const ensureTrackReady = useCallback(async (
    index: number,
    options?: ResolveTrackUrlOptions,
  ): Promise<boolean> => {
    const track = tracksRef.current[index];
    if (!track) return false;
    if (
      !options?.forceRefresh
      && track.url.trim()
      && !isPendingAudioTrackUrl(track.url)
    ) {
      return true;
    }

    const resolver = resolveTrackUrlRef.current;
    if (!resolver) return false;

    setResolvingIndex(index);
    try {
      const url = await resolver(index, track, options);
      if (!url?.trim()) return false;
      // Keep tracksRef in sync immediately so listswitch / skip handlers
      // don't treat this track as still pending before React re-renders.
      tracksRef.current = tracksRef.current.map((item, itemIndex) => (
        itemIndex === index ? { ...item, url } : item
      ));
      applyTrackUrlToPlayer(index, url);
      return true;
    } finally {
      setResolvingIndex(current => (current === index ? null : current));
    }
  }, [applyTrackUrlToPlayer]);

  const ensureTrackReadyRef = useRef(ensureTrackReady);
  ensureTrackReadyRef.current = ensureTrackReady;
  const refreshAttemptsRef = useRef(new Set<number>());

  const switchToIndex = useCallback((index: number) => {
    void (async () => {
      const player = playerRef.current;
      if (!player || index < 0 || index >= tracksLengthRef.current) return;

      const ready = await ensureTrackReadyRef.current(index);
      if (!ready) return;

      userNavigatingRef.current = true;
      player.list.switch(index);
      applyTrackIndex(index);
      void player.audio.play().catch(() => {});
    })();
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
    () => tracks.map(trackIdentityKey).join("\n"),
    [tracks],
  );
  const tracksSignatureRef = useRef(tracksSignature);
  const hasTracks = tracks.length > 0;
  // Bumped only when the playlist is replaced (not load-more append), so playback
  // is not torn down while the current track is still playing.
  const [listEpoch, setListEpoch] = useState(0);

  useEffect(() => {
    const prev = tracksSignatureRef.current;
    const next = tracksSignature;
    if (prev === next) return;
    tracksSignatureRef.current = next;
    if (!isTrackListAppendOrSame(prev, next)) {
      setListEpoch(epoch => epoch + 1);
    }
  }, [tracksSignature]);

  useEffect(() => {
    refreshAttemptsRef.current.clear();
  }, [listEpoch]);

  useEffect(() => {
    const container = engineRef.current;
    if (!container || !hasTracks) return;

    initialRestoreDoneRef.current = false;
    ensureAPlayerHlsGlobal();
    const initialMode = readStoredChannelPlaybackMode(storageName);
    playbackModeRef.current = initialMode;
    setPlaybackMode(initialMode);

    const initialTracks = tracksRef.current;
    const multi = initialTracks.length > 1;
    const player = new APlayer({
      container,
      theme: readOrbitAccentColor(),
      preload,
      mutex: true,
      loop: multi ? defaultLoop : "none",
      order: "list",
      listFolded: true,
      listMaxHeight: 0,
      storageName,
      audio: initialTracks.map(toAPlayerItem),
    });

    if (multi) {
      applyChannelPlaybackMode(player, initialMode);
    }

    player.audio.dataset.orbitReaderAudio = "true";
    player.audio.volume = readStoredAudioVolume();
    player.audio.playbackRate = readStoredPlaybackRate();
    const originalPlay = player.play.bind(player);
    const originalSkipForward = player.skipForward.bind(player);
    const originalSkipBack = player.skipBack.bind(player);
    // APlayer's ended handler calls skipForward() then play() immediately.
    // While the next track URL is still resolving, that play() would restart the
    // just-finished track — suppress it until the next track is ready.
    let suppressAutoPlay = false;
    const trackNeedsResolve = (index: number): boolean => {
      const track = tracksRef.current[index];
      if (!track) return false;
      return !track.url.trim() || isPendingAudioTrackUrl(track.url);
    };
    const playWhenAllowed = () => {
      suppressAutoPlay = false;
      originalPlay();
    };
    player.play = () => {
      if (suppressAutoPlay) {
        player.pause();
        return;
      }
      originalPlay();
    };
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
    const resolveAndSwitch = (index: number, { playAfter }: { playAfter: boolean }) => {
      userNavigatingRef.current = true;
      suppressAutoPlay = true;
      void (async () => {
        player.pause();
        try {
          const ready = await ensureTrackReadyRef.current(index);
          if (!ready) {
            userNavigatingRef.current = false;
            return;
          }
          player.list.switch(index);
          applyTrackIndex(index);
          userNavigatingRef.current = false;
          if (playAfter) {
            playWhenAllowed();
          } else {
            suppressAutoPlay = false;
          }
        } finally {
          suppressAutoPlay = false;
          userNavigatingRef.current = false;
        }
      })();
    };
    player.skipForward = () => {
      if (player.list.audios.length <= 1) {
        seekByOffset(AUDIO_SEEK_STEP_SECONDS);
        return;
      }
      if (player.audio.paused && !userNavigatingRef.current && !player.audio.ended) return;

      const nextIndex = player.nextIndex();
      if (trackNeedsResolve(nextIndex)) {
        resolveAndSwitch(nextIndex, { playAfter: true });
        return;
      }
      originalSkipForward();
    };
    player.skipBack = () => {
      if (player.list.audios.length <= 1) {
        seekByOffset(-AUDIO_SEEK_STEP_SECONDS);
        return;
      }

      const prevIndex = player.prevIndex();
      if (trackNeedsResolve(prevIndex)) {
        resolveAndSwitch(prevIndex, { playAfter: true });
        return;
      }
      originalSkipBack();
    };
    playerRef.current = player;
    syncedTrackCountRef.current = initialTracks.length;

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
    const onAudioError = () => {
      if (!resolveTrackUrlRef.current) return;

      const index = player.list.index;
      if (refreshAttemptsRef.current.has(index)) return;
      refreshAttemptsRef.current.add(index);

      const failedUrl = player.list.audios[index]?.url?.trim() ?? "";
      const shouldResume = !player.audio.paused || player.audio.ended;
      suppressAutoPlay = true;
      void (async () => {
        player.pause();
        try {
          const ready = await ensureTrackReadyRef.current(index, { forceRefresh: true });
          if (!ready) return;

          const refreshedUrl = player.list.audios[index]?.url?.trim() ?? "";
          if (!refreshedUrl || refreshedUrl === failedUrl) return;

          if (player.list.index === index) {
            player.list.switch(index);
          }
          if (shouldResume) {
            playWhenAllowed();
          } else {
            suppressAutoPlay = false;
          }
        } finally {
          suppressAutoPlay = false;
        }
      })();
    };
    let listSwitchResolving = false;
    const onListsSwitch = (...args: unknown[]) => {
      if (listSwitchResolving) return;
      const detail = args[0] as { index?: number } | undefined;
      const index = detail?.index ?? player.list.index;
      const shouldResume = userNavigatingRef.current || !player.audio.paused || suppressAutoPlay;

      if (!trackNeedsResolve(index)) {
        applyTrackIndex(index);
        userNavigatingRef.current = false;
        return;
      }

      // APlayer may switch to a pending placeholder then call play() (e.g. loop=none).
      suppressAutoPlay = true;
      listSwitchResolving = true;
      void (async () => {
        player.pause();
        try {
          const ready = await ensureTrackReadyRef.current(index);
          if (!ready) {
            userNavigatingRef.current = false;
            return;
          }
          applyTrackIndex(index);
          userNavigatingRef.current = false;
          if (shouldResume) {
            playWhenAllowed();
          } else {
            suppressAutoPlay = false;
          }
        } finally {
          suppressAutoPlay = false;
          listSwitchResolving = false;
        }
      })();
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
    player.audio.addEventListener("error", onAudioError);

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
      player.audio.removeEventListener("error", onAudioError);
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
    listEpoch,
    hasTracks,
    syncPlaybackSnapshot,
    syncTimeline,
    restorePlaybackSnapshot,
    applyTrackIndex,
  ]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    tracks.forEach((track, index) => {
      if (index >= player.list.audios.length) return;
      const audio = player.list.audios[index];
      if (!audio) return;

      if (track.url.trim() && !isPendingAudioTrackUrl(track.url)) {
        applyTrackUrlToPlayer(index, track.url);
      }

      const cover = track.cover?.trim();
      if (cover && audio.cover !== cover) {
        audio.cover = cover;
      }
    });
  }, [tracks, applyTrackUrlToPlayer]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const synced = syncedTrackCountRef.current;
    if (tracks.length <= synced) return;

    // Load-more only: refuse to append when the existing prefix was replaced
    // (search / channel refresh). Remount is handled via listEpoch.
    const prefixMatches = tracks.slice(0, synced).every((track, index) => {
      const audio = player.list.audios[index];
      if (!audio) return false;
      return track.name === audio.name && (track.artist ?? "") === (audio.artist ?? "");
    });
    if (!prefixMatches) return;

    const wasSingle = synced <= 1;
    player.list.add(tracks.slice(synced).map(toAPlayerItem));
    syncedTrackCountRef.current = tracks.length;

    if (wasSingle && tracks.length > 1) {
      applyChannelPlaybackMode(player, playbackModeRef.current);
    } else if (playbackModeRef.current === "shuffle") {
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
    void (async () => {
      const player = playerRef.current;
      if (!player) return;

      if (player.audio.paused) {
        const ready = await ensureTrackReadyRef.current(player.list.index);
        if (!ready) return;
      }

      player.toggle();
    })();
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
    resolvingIndex,
  };
}
