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
