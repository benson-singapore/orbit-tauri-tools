import type { TTSVoiceItem } from "@/lib/ttsApi";

const FAVORITES_KEY = "tts-voice-favorites";
const FAVORITES_VOICES_KEY = "tts-voice-favorites-data";
const DEFAULT_VOICE_KEY = "tts-default-voice";

export function loadFavoriteVoiceIds(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

export function persistFavoriteVoiceIds(ids: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
}

export function loadFavoriteVoices(): TTSVoiceItem[] {
  try {
    const raw = localStorage.getItem(FAVORITES_VOICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TTSVoiceItem[]) : [];
  } catch {
    return [];
  }
}

export function persistFavoriteVoices(voices: TTSVoiceItem[]) {
  localStorage.setItem(FAVORITES_VOICES_KEY, JSON.stringify(voices));
}

export function dedupeVoicesById(voices: TTSVoiceItem[]): TTSVoiceItem[] {
  const seen = new Set<string>();
  return voices.filter(voice => {
    if (seen.has(voice.id)) return false;
    seen.add(voice.id);
    return true;
  });
}

export function loadDefaultTTSVoice(): TTSVoiceItem | null {
  try {
    const raw = localStorage.getItem(DEFAULT_VOICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TTSVoiceItem;
    if (!parsed?.value?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistDefaultTTSVoice(voice: TTSVoiceItem) {
  localStorage.setItem(DEFAULT_VOICE_KEY, JSON.stringify(voice));
}

export function clearDefaultTTSVoice() {
  localStorage.removeItem(DEFAULT_VOICE_KEY);
}

export const TTS_VOICE_STORAGE_KEYS = {
  favorites: FAVORITES_KEY,
  favoriteVoices: FAVORITES_VOICES_KEY,
  defaultVoice: DEFAULT_VOICE_KEY,
} as const;
