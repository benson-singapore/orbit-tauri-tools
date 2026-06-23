import { useCallback, useEffect, useRef } from "react";
import Hls from "hls.js";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
import { ProxiedImage } from "@/components/ProxiedImage";
import { isHlsVideoUrl, resolveArticleVideoUrl } from "@/lib/articleVideoUrl";
import { reportSessionVideoAspectRatio } from "@/lib/videoAspectRatio";
import {
  getSessionPlaybackSnapshot,
  PLAYBACK_RESUME_EVENT,
  type PlaybackResumeEventDetail,
  updateSessionPlaybackSnapshot,
} from "@/lib/sessionVideoProgress";
import { resolveYouTubeVideoId } from "@/lib/youtube";
import type { Article } from "@/types";

interface ReaderVideoPlayerProps {
  sessionId: string;
  article: Article;
  runtimeBase: string | null;
  className?: string;
}

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
  video.addEventListener("canplay", seek, { once: true });
}

export function ReaderVideoPlayer({
  sessionId,
  article,
  runtimeBase,
  className = "relative aspect-video w-full bg-neutral-950",
}: ReaderVideoPlayerProps) {
  const youTubeVideoId = resolveYouTubeVideoId(article);
  const videoUrl = resolveArticleVideoUrl(article);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const restorePlaybackSnapshot = useCallback((position?: number) => {
    const video = videoRef.current;
    if (!video) return;

    const target = position ?? getSessionPlaybackSnapshot(sessionId)?.currentTime ?? 0;
    if (target <= 0.5) return;

    seekVideoToPosition(video, target);

    const snapshot = getSessionPlaybackSnapshot(sessionId);
    if (snapshot?.playing) {
      void video.play().catch(() => {});
    }
  }, [sessionId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reportAspectRatio = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        reportSessionVideoAspectRatio(
          sessionId,
          video.videoHeight / video.videoWidth,
        );
      }
    };

    const onMetadata = () => {
      reportAspectRatio();
      restorePlaybackSnapshot();
    };

    if (video.readyState >= 1) {
      onMetadata();
      return;
    }

    video.addEventListener("loadedmetadata", onMetadata, { once: true });
    return () => video.removeEventListener("loadedmetadata", onMetadata);
  }, [sessionId, videoUrl, restorePlaybackSnapshot]);

  useEffect(() => {
    const onResume = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackResumeEventDetail>).detail;
      if (detail.sessionId !== sessionId) return;
      restorePlaybackSnapshot(detail.position);
    };

    window.addEventListener(PLAYBACK_RESUME_EVENT, onResume);
    return () => window.removeEventListener(PLAYBACK_RESUME_EVENT, onResume);
  }, [sessionId, restorePlaybackSnapshot]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || youTubeVideoId) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!isHlsVideoUrl(videoUrl)) {
      video.src = videoUrl;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        restorePlaybackSnapshot();
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = videoUrl;
    }
  }, [videoUrl, youTubeVideoId, restorePlaybackSnapshot]);

  return (
    <div className={className}>
      {youTubeVideoId ? (
        <YouTubeEmbed sessionId={sessionId} videoId={youTubeVideoId} title={article.title} />
      ) : videoUrl ? (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          controls
          playsInline
          poster={article.image}
          onLoadedMetadata={event => {
            const video = event.currentTarget;
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              reportSessionVideoAspectRatio(
                sessionId,
                video.videoHeight / video.videoWidth,
              );
            }
          }}
          onTimeUpdate={event => {
            const video = event.currentTarget;
            updateSessionPlaybackSnapshot(sessionId, {
              currentTime: video.currentTime,
              playing: !video.paused,
            });
          }}
          onPlay={() => {
            updateSessionPlaybackSnapshot(sessionId, { playing: true });
          }}
          onPause={() => {
            updateSessionPlaybackSnapshot(sessionId, { playing: false });
          }}
        />
      ) : article.image ? (
        <ProxiedImage
          runtimeBase={runtimeBase}
          src={article.image}
          alt={article.title}
          className="w-full h-full object-cover opacity-80"
        />
      ) : null}
    </div>
  );
}
