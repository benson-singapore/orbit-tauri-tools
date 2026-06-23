export interface SessionPlaybackSnapshot {
  currentTime: number;
  playing: boolean;
}

const snapshots = new Map<string, SessionPlaybackSnapshot>();

export function getSessionPlaybackSnapshot(sessionId: string): SessionPlaybackSnapshot | null {
  return snapshots.get(sessionId) ?? null;
}

export function updateSessionPlaybackSnapshot(
  sessionId: string,
  patch: Partial<SessionPlaybackSnapshot>,
): void {
  const previous = snapshots.get(sessionId) ?? { currentTime: 0, playing: false };
  snapshots.set(sessionId, { ...previous, ...patch });
}

export function clearSessionPlaybackSnapshot(sessionId: string): void {
  snapshots.delete(sessionId);
}

export const PLAYBACK_RESUME_EVENT = "orbit:playback-resume";

export interface PlaybackResumeEventDetail {
  sessionId: string;
  position: number;
}

export function dispatchPlaybackResume(sessionId: string, position: number): void {
  if (!sessionId || position <= 0) return;
  window.dispatchEvent(
    new CustomEvent<PlaybackResumeEventDetail>(PLAYBACK_RESUME_EVENT, {
      detail: { sessionId, position },
    }),
  );
}

export function snapshotNativeVideoProgress(
  sessionId: string,
  container: HTMLElement,
): void {
  const video = container.querySelector("video");
  if (!video) return;

  updateSessionPlaybackSnapshot(sessionId, {
    currentTime: video.currentTime,
    playing: !video.paused,
  });
}

/** Capture progress from an inline `<video>` inside article HTML before docking. */
export function snapshotContentVideoProgress(
  sessionId: string,
  contentRoot: HTMLElement | null,
): void {
  if (!contentRoot) return;

  const video = contentRoot.querySelector("video");
  if (!video) return;

  updateSessionPlaybackSnapshot(sessionId, {
    currentTime: video.currentTime,
    playing: !video.paused,
  });
}
