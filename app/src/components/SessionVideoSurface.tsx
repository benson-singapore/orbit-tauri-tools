import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ReaderVideoPlayer } from "@/components/ReaderVideoPlayer";
import { useVideoSessionMount, useVideoParkingLot } from "@/components/VideoWallMountContext";
import { reparentSessionVideoContainer } from "@/lib/sessionVideoPlayback";
import { clearSessionPlaybackSnapshot } from "@/lib/sessionVideoProgress";
import { renderSessionVideo, unmountSessionVideo } from "@/lib/sessionVideoRoot";
import { resolveYouTubeVideoId } from "@/lib/youtube";
import type { Article } from "@/types";

interface SessionVideoSurfaceProps {
  sessionId: string;
  article: Article;
  runtimeBase: string | null;
  useWallMount: boolean;
}

function resolveVideoTarget(
  useWallMount: boolean,
  wallMount: HTMLDivElement | null,
  modalMount: HTMLDivElement | null,
  parkingLot: HTMLDivElement | null,
): HTMLDivElement | null {
  if (useWallMount) {
    // Avoid the hidden off-screen modal mount while the wall tile is mounting.
    return wallMount ?? parkingLot;
  }
  return modalMount ?? parkingLot;
}

function buildVideoIdentity(article: Article): string {
  return `${article.pluginId}:${article.id}:${article.videoUrl ?? ""}:${article.sourceUrl ?? ""}`;
}

export function SessionVideoSurface({
  sessionId,
  article,
  runtimeBase,
  useWallMount,
}: SessionVideoSurfaceProps) {
  const wallMount = useVideoSessionMount(sessionId, "wall", useWallMount);
  const modalMount = useVideoSessionMount(sessionId, "modal", true);
  const parkingLot = useVideoParkingLot();

  const activeTarget = useMemo(
    () => resolveVideoTarget(useWallMount, wallMount, modalMount, parkingLot),
    [useWallMount, wallMount, modalMount, parkingLot],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  if (!containerRef.current && typeof document !== "undefined") {
    containerRef.current = document.createElement("div");
    containerRef.current.style.width = "100%";
    containerRef.current.style.height = "100%";
  }

  const videoIdentity = buildVideoIdentity(article);
  const youTubeVideoId = resolveYouTubeVideoId(article);
  const articleRef = useRef(article);
  const prevUseWallMountRef = useRef(useWallMount);
  articleRef.current = article;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    renderSessionVideo(
      sessionId,
      container,
      (
        <ReaderVideoPlayer
          sessionId={sessionId}
          article={articleRef.current}
          runtimeBase={runtimeBase}
          className="relative w-full h-full bg-neutral-950"
        />
      ),
      videoIdentity,
    );

    return () => {
      unmountSessionVideo(sessionId);
      clearSessionPlaybackSnapshot(sessionId);
    };
  }, [sessionId, videoIdentity, runtimeBase]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !activeTarget) return;

    const dockTransition = !prevUseWallMountRef.current && useWallMount;
    prevUseWallMountRef.current = useWallMount;

    reparentSessionVideoContainer(container, activeTarget, sessionId, youTubeVideoId, {
      assumeYouTubePlaying: dockTransition,
    });
  }, [activeTarget, sessionId, youTubeVideoId, useWallMount]);

  return null;
}
