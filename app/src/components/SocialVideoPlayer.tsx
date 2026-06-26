import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { isHlsVideoUrl } from "@/lib/articleVideoUrl";

interface SocialVideoPlayerProps {
  videoUrl: string;
  poster?: string;
  className?: string;
}

export function SocialVideoPlayer({
  videoUrl,
  poster,
  className = "w-full rounded-xl bg-black max-h-[32rem]",
}: SocialVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const trimmed = videoUrl.trim();
    if (!video || !trimmed) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!isHlsVideoUrl(trimmed)) {
      video.src = trimmed;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(trimmed);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = trimmed;
    }
  }, [videoUrl]);

  return (
    <video
      ref={videoRef}
      controls
      playsInline
      preload="metadata"
      poster={poster}
      className={className}
    />
  );
}
