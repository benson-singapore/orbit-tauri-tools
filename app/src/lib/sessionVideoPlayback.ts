import {
  getSessionPlaybackSnapshot,
  snapshotNativeVideoProgress,
  type SessionPlaybackSnapshot,
} from "@/lib/sessionVideoProgress";

export function playYouTubeIframe(iframe: HTMLIFrameElement): void {
  iframe.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func: "playVideo", args: "" }),
    "*",
  );
}

export function seekYouTubeIframe(iframe: HTMLIFrameElement, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;

  iframe.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
    "*",
  );
}

export function requestYouTubeCurrentTime(iframe: HTMLIFrameElement): void {
  iframe.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func: "getCurrentTime", args: "" }),
    "*",
  );
}

export function subscribeYouTubeIframeEvents(iframe: HTMLIFrameElement): void {
  iframe.contentWindow?.postMessage(
    JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
    "*",
  );
}

export function scheduleYouTubePlaybackRestore(
  iframe: HTMLIFrameElement,
  sessionId: string,
): void {
  const snapshot = getSessionPlaybackSnapshot(sessionId);
  if (!snapshot) return;

  const delays = [0, 120, 320, 720];
  for (const delay of delays) {
    window.setTimeout(() => {
      if (snapshot.currentTime > 0.5) {
        seekYouTubeIframe(iframe, snapshot.currentTime);
      }
      if (snapshot.playing) {
        playYouTubeIframe(iframe);
      }
    }, delay);
  }
}

function restoreNativeVideoPlayback(
  container: HTMLElement,
  snapshot: SessionPlaybackSnapshot,
): void {
  const video = container.querySelector("video");
  if (!video) return;

  if (snapshot.currentTime > 0.5) {
    try {
      video.currentTime = snapshot.currentTime;
    } catch {
      // Ignore seek failures before metadata is ready.
    }
  }

  if (snapshot.playing && video.paused) {
    void video.play().catch(() => {});
  }
}

export function restoreSessionPlayback(
  container: HTMLElement,
  sessionId: string,
  youTubeVideoId: string | null,
): void {
  const snapshot = getSessionPlaybackSnapshot(sessionId);
  if (!snapshot) return;

  const video = container.querySelector("video");
  if (video) {
    restoreNativeVideoPlayback(container, snapshot);
    return;
  }

  const iframe = container.querySelector("iframe");
  if (!iframe || !youTubeVideoId) return;

  scheduleYouTubePlaybackRestore(iframe, sessionId);
}

function captureWasPlaying(
  sessionId: string,
  container: HTMLElement,
  youTubeVideoId: string | null,
  options?: { assumeYouTubePlaying?: boolean },
): boolean {
  snapshotNativeVideoProgress(sessionId, container);

  const snapshot = getSessionPlaybackSnapshot(sessionId);
  if (snapshot?.playing) return true;

  if (youTubeVideoId && options?.assumeYouTubePlaying) {
    return (snapshot?.currentTime ?? 0) > 0;
  }

  return false;
}

export function reparentSessionVideoContainer(
  container: HTMLElement,
  target: HTMLElement,
  sessionId: string,
  youTubeVideoId: string | null,
  options?: { assumeYouTubePlaying?: boolean },
): void {
  if (container.parentNode === target) return;

  const iframe = container.querySelector("iframe");
  if (iframe) {
    requestYouTubeCurrentTime(iframe);
  }

  const wasPlaying = captureWasPlaying(sessionId, container, youTubeVideoId, options);
  target.appendChild(container);

  if (wasPlaying) {
    restoreSessionPlayback(container, sessionId, youTubeVideoId);
  }
}
