import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
import { ProxiedImage } from "@/components/ProxiedImage";
import { isHlsVideoUrl, resolveArticleVideoUrl } from "@/lib/articleVideoUrl";
import { reportSessionVideoAspectRatio } from "@/lib/videoAspectRatio";
import {
  getSessionPlaybackSnapshot,
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

export function ReaderVideoPlayer({
  sessionId,
  article,
  runtimeBase,
  className = "relative aspect-video w-full bg-neutral-950",
}: ReaderVideoPlayerProps) {
  const youTubeVideoId = resolveYouTubeVideoId(article);
  const videoUrl = resolveArticleVideoUrl(article);
  const videoRef = useRef<HTMLVideoElement>(null);
  const savedSnapshotRef = useRef(getSessionPlaybackSnapshot(sessionId));

  useEffect(() => {
    savedSnapshotRef.current = getSessionPlaybackSnapshot(sessionId);
  }, [sessionId]);

  useEffect(() => {
    const video = videoRef.current;
    const savedSnapshot = savedSnapshotRef.current;
    if (!video || !savedSnapshot) return;

    const applySnapshot = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        reportSessionVideoAspectRatio(
          sessionId,
          video.videoHeight / video.videoWidth,
        );
      }
      if (savedSnapshot.currentTime > 0.5) {
        try {
          video.currentTime = savedSnapshot.currentTime;
        } catch {
          // Ignore seek failures before metadata is ready.
        }
      }
      if (savedSnapshot.playing) {
        void video.play().catch(() => {});
      }
    };

    if (video.readyState >= 1) {
      applySnapshot();
      return;
    }

    video.addEventListener("loadedmetadata", applySnapshot, { once: true });
    return () => video.removeEventListener("loadedmetadata", applySnapshot);
  }, [sessionId, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || youTubeVideoId) return;

    if (!isHlsVideoUrl(videoUrl)) {
      video.src = videoUrl;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      return () => hls.destroy();
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = videoUrl;
    }
  }, [videoUrl, youTubeVideoId]);

  return (
    <div className={className}>
      {youTubeVideoId ? (
        <YouTubeEmbed sessionId={sessionId} videoId={youTubeVideoId} title={article.title} />
      ) : videoUrl ? (
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          controls
          playsInline
          poster={article.image}
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
