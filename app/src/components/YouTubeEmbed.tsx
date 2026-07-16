import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  requestYouTubeCurrentTime,
  scheduleYouTubePlaybackRestore,
  subscribeYouTubeIframeEvents,
} from "@/lib/sessionVideoPlayback";
import {
  getSessionPlaybackSnapshot,
  PLAYBACK_RESUME_EVENT,
  type PlaybackResumeEventDetail,
  updateSessionPlaybackSnapshot,
} from "@/lib/sessionVideoProgress";
import {
  fetchYouTubeStream,
  needsYouTubeEmbedRelay,
  resolveYouTubeEmbedSrc,
  resolveYouTubeRelayEmbedSrc,
  youtubeSimpleEmbedUrl,
  type YouTubeStreamInfo,
} from "@/lib/youtube";
import {
  isYouTubeAuthenticated,
  listenYouTubeLoginDone,
  openYouTubeLoginWindow,
} from "@/lib/youtubeAuth";
import {
  shouldUseRuntimeEmbed,
  useYouTubeEmbedBase,
} from "@/hooks/useYouTubeEmbedBase";

interface YouTubeEmbedProps {
  sessionId?: string;
  runtimeBase?: string | null;
  videoId: string;
  title: string;
}

const CONTROL_BTN_CLASS =
  "absolute bottom-3 z-10 flex h-12 w-14 items-center justify-center text-white/90 transition-colors hover:bg-white/10 hover:text-white";

const YT_PLAYING = 1;
const YT_BUFFERING = 3;

type PlaybackMode =
  | { kind: "loading" }
  | { kind: "native"; stream: YouTubeStreamInfo }
  | { kind: "iframe"; src: string };

function seekVideoToPosition(video: HTMLVideoElement, position: number): void {
  if (position <= 0.5) return;

  const seek = () => {
    try {
      if (Math.abs(video.currentTime - position) > 0.75) {
        video.currentTime = position;
      }
    } catch {
      // Ignore seek failures before the media is ready.
    }
  };

  if (video.readyState >= 1) {
    seek();
  }
  video.addEventListener("loadedmetadata", seek, { once: true });
}

export function YouTubeEmbed({ sessionId, runtimeBase, videoId, title }: YouTubeEmbedProps) {
  const [isTheater, setIsTheater] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const enableJsApi = Boolean(sessionId);
  const embedBase = useYouTubeEmbedBase(runtimeBase);
  const [playback, setPlayback] = useState<PlaybackMode>({ kind: "loading" });
  const [authVersion, setAuthVersion] = useState(0);
  const [loginPending, setLoginPending] = useState(false);
  const preferIframe = isYouTubeAuthenticated();

  const fallbackEmbedSrc = useMemo(() => {
    if (embedBase.status !== "ready") return null;
    const start = sessionId ? getSessionPlaybackSnapshot(sessionId)?.currentTime ?? 0 : 0;
    const base = shouldUseRuntimeEmbed(embedBase.base) ? embedBase.base : null;
    return resolveYouTubeEmbedSrc(base, videoId, {
      startSeconds: start,
      enableJsApi,
      title,
    });
  }, [embedBase, sessionId, videoId, enableJsApi, title]);

  useEffect(() => {
    setIsTheater(false);
  }, [videoId]);

  useEffect(() => {
    return listenYouTubeLoginDone(() => {
      setAuthVersion(version => version + 1);
      setLoginPending(false);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolvePlayback = async () => {
      if (embedBase.status === "loading") {
        setPlayback({ kind: "loading" });
        return;
      }
      if (embedBase.status === "unsupported") {
        setPlayback({ kind: "loading" });
        return;
      }

      const start = sessionId ? getSessionPlaybackSnapshot(sessionId)?.currentTime ?? 0 : 0;

      if (preferIframe) {
        const relaySrc =
          needsYouTubeEmbedRelay() && embedBase.status === "ready"
            ? resolveYouTubeRelayEmbedSrc(embedBase.base, videoId, {
                startSeconds: start,
                enableJsApi,
                title,
              })
            : null;
        setPlayback({
          kind: "iframe",
          src: relaySrc ?? youtubeSimpleEmbedUrl(videoId, start),
        });
        return;
      }

      if (shouldUseRuntimeEmbed(embedBase.base)) {
        const stream = await fetchYouTubeStream(embedBase.base, videoId);
        if (cancelled) return;
        if (stream) {
          setPlayback({ kind: "native", stream });
          return;
        }
      }

      if (fallbackEmbedSrc) {
        if (!cancelled) {
          setPlayback({ kind: "iframe", src: fallbackEmbedSrc });
        }
        return;
      }

      if (!cancelled) {
        setPlayback({ kind: "loading" });
      }
    };

    void resolvePlayback();
    return () => {
      cancelled = true;
    };
  }, [embedBase, videoId, fallbackEmbedSrc, preferIframe, authVersion, sessionId]);

  const restoreNativePlayback = useCallback((position?: number) => {
    const video = videoRef.current;
    if (!video) return;

    const target = position ?? getSessionPlaybackSnapshot(sessionId ?? "")?.currentTime ?? 0;
    if (target > 0.5) {
      seekVideoToPosition(video, target);
    }

    const snapshot = sessionId ? getSessionPlaybackSnapshot(sessionId) : null;
    if (snapshot?.playing) {
      void video.play().catch(() => {});
    }
  }, [sessionId]);

  useEffect(() => {
    if (playback.kind !== "native") return;
    const video = videoRef.current;
    if (!video) return;

    const onMetadata = () => {
      restoreNativePlayback();
    };

    if (video.readyState >= 1) {
      onMetadata();
      return;
    }

    video.addEventListener("loadedmetadata", onMetadata, { once: true });
    return () => video.removeEventListener("loadedmetadata", onMetadata);
  }, [playback, restoreNativePlayback, videoId]);

  useEffect(() => {
    if (!sessionId || playback.kind !== "native") return;

    const onResume = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackResumeEventDetail>).detail;
      if (detail.sessionId !== sessionId) return;
      restoreNativePlayback(detail.position);
    };

    window.addEventListener(PLAYBACK_RESUME_EVENT, onResume);
    return () => window.removeEventListener(PLAYBACK_RESUME_EVENT, onResume);
  }, [sessionId, playback.kind, restoreNativePlayback]);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !sessionId) return;

    subscribeYouTubeIframeEvents(iframe);
    scheduleYouTubePlaybackRestore(iframe, sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (playback.kind !== "iframe") return;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (typeof event.data !== "string") return;

      try {
        const data = JSON.parse(event.data) as {
          event?: string;
          info?: number | { playerState?: number; currentTime?: number };
        };

        if (data.event === "infoDelivery" && typeof data.info === "object" && data.info) {
          const patch: { currentTime?: number; playing?: boolean } = {};

          if (typeof data.info.currentTime === "number") {
            patch.currentTime = data.info.currentTime;
          }
          if (data.info.playerState !== undefined) {
            patch.playing =
              data.info.playerState === YT_PLAYING || data.info.playerState === YT_BUFFERING;
          }

          if (sessionId && Object.keys(patch).length > 0) {
            updateSessionPlaybackSnapshot(sessionId, patch);
          }
          return;
        }

        if (data.event === "onStateChange" && typeof data.info === "number" && sessionId) {
          updateSessionPlaybackSnapshot(sessionId, {
            playing: data.info === YT_PLAYING || data.info === YT_BUFFERING,
          });
        }
      } catch {
        // Ignore non-JSON postMessages.
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sessionId, playback.kind]);

  useEffect(() => {
    if (!sessionId || playback.kind !== "iframe") return;

    const onResume = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackResumeEventDetail>).detail;
      if (detail.sessionId !== sessionId) return;
      const iframe = iframeRef.current;
      if (!iframe) return;
      scheduleYouTubePlaybackRestore(iframe, sessionId);
    };

    window.addEventListener(PLAYBACK_RESUME_EVENT, onResume);
    return () => window.removeEventListener(PLAYBACK_RESUME_EVENT, onResume);
  }, [sessionId, playback.kind]);

  useEffect(() => {
    if (!sessionId || playback.kind !== "iframe") return;

    const poll = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      requestYouTubeCurrentTime(iframe);
    };

    poll();
    const intervalId = window.setInterval(poll, 2000);
    return () => window.clearInterval(intervalId);
  }, [sessionId, playback.kind, videoId]);

  const exitTheater = useCallback(() => setIsTheater(false), []);

  useEffect(() => {
    if (!isTheater) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        exitTheater();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isTheater, exitTheater]);

  const handleYouTubeLogin = useCallback(() => {
    setLoginPending(true);
    void openYouTubeLoginWindow().finally(() => {
      setLoginPending(false);
    });
  }, []);

  const qualityLabel =
    playback.kind === "native" ? playback.stream.quality : playback.kind === "iframe" ? "YouTube" : null;

  const playerHost =
    playback.kind === "native" ? (
      <div className="absolute inset-0 bg-black">
        <video
          key={`${videoId}:${playback.stream.streamUrl}`}
          ref={videoRef}
          src={playback.stream.streamUrl}
          className="w-full h-full object-contain"
          controls
          playsInline
          title={title}
          onTimeUpdate={event => {
            if (!sessionId) return;
            const video = event.currentTarget;
            updateSessionPlaybackSnapshot(sessionId, {
              currentTime: video.currentTime,
              playing: !video.paused,
            });
          }}
          onPlay={() => {
            if (sessionId) {
              updateSessionPlaybackSnapshot(sessionId, { playing: true });
            }
          }}
          onPause={() => {
            if (sessionId) {
              updateSessionPlaybackSnapshot(sessionId, { playing: false });
            }
          }}
        />
      </div>
    ) : playback.kind === "iframe" ? (
      <div className="absolute inset-0 bg-black">
        <iframe
          key={playback.src}
          ref={iframeRef}
          src={playback.src}
          title={title}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={handleIframeLoad}
        />
      </div>
    ) : (
      <div className="absolute inset-0 flex items-center justify-center bg-black px-6 text-center text-sm text-white/70">
        {embedBase.status === "unsupported"
          ? embedBase.message
          : "正在解析视频流…"}
      </div>
    );

  const shell = (
    <div className="relative w-full h-full">
      {playerHost}
      {qualityLabel ? (
        <div className="pointer-events-none absolute top-4 left-4 rounded-full bg-black/60 px-3 py-1 text-xs backdrop-blur-md">
          {playback.kind === "native" ? `直链 · ${qualityLabel}` : preferIframe ? `已登录 · ${qualityLabel}` : "YouTube"}
        </div>
      ) : null}
      <button
        type="button"
        onClick={handleYouTubeLogin}
        disabled={loginPending}
        className="absolute top-4 right-16 z-10 rounded-full bg-black/60 px-3 py-1 text-xs text-white/90 backdrop-blur-md transition-colors hover:bg-black/80 disabled:opacity-60"
        title="在应用内登录 YouTube，登录态会与播放器共享"
      >
        {loginPending ? "正在打开登录…" : preferIframe ? "重新登录" : "登录 YouTube"}
      </button>
      <button
        type="button"
        onClick={() => setIsTheater(true)}
        className={`${CONTROL_BTN_CLASS} right-0`}
        title="全屏播放"
        aria-label="全屏播放"
      >
        <Icon name="expand" className="w-5 h-5" />
      </button>
    </div>
  );

  if (isTheater) {
    return (
      <div className="fixed inset-0 z-[200] bg-black">
        <div className="absolute inset-0">{playerHost}</div>
        <button
          type="button"
          onClick={exitTheater}
          className={`${CONTROL_BTN_CLASS} right-0`}
          title="退出全屏 (Esc)"
          aria-label="退出全屏"
        >
          <Icon name="collapse" className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return shell;
}
