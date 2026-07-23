export interface AudioFocusPlaybackCache {
  resolvedUrls: Record<string, string>;
  resolvedCovers: Record<string, string>;
  resolvedLyrics: Record<string, string>;
  resolvedSummaries: Record<string, string>;
  playlistOrder: string[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
}

const EMPTY_CACHE: AudioFocusPlaybackCache = {
  resolvedUrls: {},
  resolvedCovers: {},
  resolvedLyrics: {},
  resolvedSummaries: {},
  playlistOrder: [],
  currentIndex: 0,
  isPlaying: false,
  currentTime: 0,
};

const cache = new Map<string, AudioFocusPlaybackCache>();

export function mergeAudioFocusPlaybackCache(
  sessionId: string,
  patch: Partial<AudioFocusPlaybackCache>,
): AudioFocusPlaybackCache {
  const previous = cache.get(sessionId) ?? EMPTY_CACHE;
  const next = { ...previous, ...patch };
  cache.set(sessionId, next);
  return next;
}

export function setAudioFocusPlaybackCache(
  sessionId: string,
  state: AudioFocusPlaybackCache,
): void {
  cache.set(sessionId, state);
}

export function getAudioFocusPlaybackCache(sessionId: string): AudioFocusPlaybackCache | null {
  return cache.get(sessionId) ?? null;
}
