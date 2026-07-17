const VOLUME_KEY = "orbit.audioVolume";
const RATE_KEY = "orbit.audioPlaybackRate";

export const PLAYBACK_RATE_STEPS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(PLAYBACK_RATE_STEPS[0], Math.min(PLAYBACK_RATE_STEPS.at(-1)!, value));
}

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore quota / private mode
  }
}

export function readStoredAudioVolume(): number {
  return clampVolume(readNumber(VOLUME_KEY, 1));
}

export function persistAudioVolume(volume: number): void {
  writeNumber(VOLUME_KEY, clampVolume(volume));
}

export function readStoredPlaybackRate(): number {
  const stored = readNumber(RATE_KEY, 1);
  const steps = PLAYBACK_RATE_STEPS as readonly number[];
  if (steps.includes(stored)) return stored;
  return clampRate(stored);
}

export function persistPlaybackRate(rate: number): void {
  writeNumber(RATE_KEY, clampRate(rate));
}

export function stepPlaybackRate(current: number, direction: -1 | 1): number {
  const steps = PLAYBACK_RATE_STEPS as readonly number[];
  const normalized = clampRate(current);
  const index = steps.findIndex(step => Math.abs(step - normalized) < 0.001);
  const baseIndex = index >= 0 ? index : steps.findIndex(step => step >= normalized);
  const startIndex = baseIndex >= 0 ? baseIndex : 1;
  const nextIndex = Math.max(0, Math.min(steps.length - 1, startIndex + direction));
  return steps[nextIndex] ?? 1;
}

export function formatPlaybackRate(rate: number): string {
  if (Math.abs(rate - 1) < 0.001) return "1.0x";
  if (Number.isInteger(rate)) return `${rate}x`;
  return `${rate.toFixed(2).replace(/0$/, "").replace(/\.0$/, "")}x`;
}
