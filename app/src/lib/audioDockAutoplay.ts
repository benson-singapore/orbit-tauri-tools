import { tryAutoplayAudio } from "@/lib/audioAutoplay";

/** Host marker set on `AudioFocusDockSurface` for the hidden dock player. */
export function audioFocusDockHostSelector(sessionId: string): string {
  return `[data-orbit-audio-dock-host="${sessionId}"]`;
}

/**
 * Kick docked audio playback synchronously (must run during a user gesture).
 * Returns true when the audio element reports playing.
 */
export function kickDockedAudioFocusAutoplay(sessionId: string): boolean {
  const audio = document.querySelector<HTMLAudioElement>(
    `${audioFocusDockHostSelector(sessionId)} audio[data-orbit-reader-audio]`,
  );
  if (!audio) return false;

  try {
    audio.play();
    if (!audio.paused) return true;
  } catch {
    // Fall through to muted / async retry.
  }

  void tryAutoplayAudio(audio).then(started => {
    if (started && audio.muted) {
      audio.muted = false;
    }
  });
  return !audio.paused;
}
