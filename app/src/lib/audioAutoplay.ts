/** Try to start playback; falls back to muted play when autoplay is blocked. */
export async function tryAutoplayAudio(audio: HTMLAudioElement): Promise<boolean> {
  try {
    await audio.play();
    return !audio.paused;
  } catch {
    // Browsers often block autoplay on hidden media; muted play is usually allowed.
  }

  const wasMuted = audio.muted;
  audio.muted = true;
  try {
    await audio.play();
    audio.muted = wasMuted;
    return !audio.paused;
  } catch {
    audio.muted = wasMuted;
    return false;
  }
}
