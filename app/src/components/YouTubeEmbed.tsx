import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  requestYouTubeCurrentTime,
  scheduleYouTubePlaybackRestore,
  subscribeYouTubeIframeEvents,
} from "@/lib/sessionVideoPlayback";
import {
  getSessionPlaybackSnapshot,
  updateSessionPlaybackSnapshot,
} from "@/lib/sessionVideoProgress";
import { youtubeEmbedUrl } from "@/lib/youtube";

interface YouTubeEmbedProps {
  sessionId?: string;
  videoId: string;
  title: string;
}

const CONTROL_BTN_CLASS =
  "absolute bottom-3 z-10 flex h-12 w-14 items-center justify-center text-white/90 transition-colors hover:bg-white/10 hover:text-white";

const YT_PLAYING = 1;
const YT_BUFFERING = 3;

export function YouTubeEmbed({ sessionId, videoId, title }: YouTubeEmbedProps) {
  const [isTheater, setIsTheater] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const embedSrc = useMemo(() => {
    if (!sessionId) return youtubeEmbedUrl(videoId);
    const start = getSessionPlaybackSnapshot(sessionId)?.currentTime ?? 0;
    return youtubeEmbedUrl(videoId, start);
  }, [sessionId, videoId]);

  useEffect(() => {
    setIsTheater(false);
  }, [videoId]);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !sessionId) return;

    subscribeYouTubeIframeEvents(iframe);
    scheduleYouTubePlaybackRestore(iframe, sessionId);
  }, [sessionId]);

  useEffect(() => {
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
  }, [sessionId, videoId]);

  useEffect(() => {
    if (!sessionId) return;

    const poll = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      requestYouTubeCurrentTime(iframe);
    };

    poll();
    const intervalId = window.setInterval(poll, 2000);
    return () => window.clearInterval(intervalId);
  }, [sessionId, videoId]);

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

  const iframeHost = (
    <div className="absolute inset-0 bg-black">
      <iframe
        ref={iframeRef}
        src={embedSrc}
        title={title}
        className="w-full h-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={handleIframeLoad}
      />
    </div>
  );

  if (isTheater) {
    return (
      <div className="fixed inset-0 z-[200] bg-black">
        <div className="absolute inset-0">{iframeHost}</div>
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

  return (
    <div className="relative w-full h-full">
      {iframeHost}
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
}
