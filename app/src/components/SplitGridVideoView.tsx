import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { isDarkTheme } from "@/lib/themeMode";
import { RatingFocusView } from "@/components/RatingFocusView";
import { VideoWallFocusView } from "@/components/VideoWallFocusView";
import {
  clampSplitPaneRatio,
} from "@/lib/splitPaneRatio";
import type { GridColumnCount } from "@/lib/gridColumnCount";
import type { GridCoverAspectRatio } from "@/lib/gridCoverAspectRatio";
import type { ReaderSession } from "@/lib/readerSessions";
import type { Article, ThemeMode } from "@/types";

interface SplitGridVideoViewProps {
  theme: ThemeMode;
  runtimeBase: string | null;
  pluginId: string;
  articles: Article[];
  gridColumnCount: GridColumnCount;
  coverAspectRatio: GridCoverAspectRatio;
  videoColumnCount: GridColumnCount;
  splitRatio: number;
  onSplitRatioChange: (ratio: number) => void;
  videoSessions: ReaderSession[];
  loading: boolean;
  loadingMore: boolean;
  searching?: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onItemSelect: (article: Article) => void;
  onExpandSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
}

export function SplitGridVideoView({
  theme,
  runtimeBase,
  pluginId,
  articles,
  gridColumnCount,
  coverAspectRatio,
  videoColumnCount,
  splitRatio,
  onSplitRatioChange,
  videoSessions,
  loading,
  loadingMore,
  searching = false,
  hasMore,
  onLoadMore,
  onItemSelect,
  onExpandSession,
  onCloseSession,
}: SplitGridVideoViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const isDark = isDarkTheme(theme);
  const leftPercent = clampSplitPaneRatio(splitRatio) * 100;

  const handleDividerPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = event.clientX;
    const startRatio = clampSplitPaneRatio(splitRatio);
    const latestRatioRef = { current: startRatio };

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextRatio = clampSplitPaneRatio(startRatio + delta / rect.width);
      latestRatioRef.current = nextRatio;
      onSplitRatioChange(nextRatio);
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, [onSplitRatioChange, splitRatio]);

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full">
      <div
        ref={leftPaneRef}
        className="min-h-0 min-w-0 overflow-y-auto"
        style={{ width: `${leftPercent}%` }}
      >
        <RatingFocusView
          theme={theme}
          runtimeBase={runtimeBase}
          articles={articles}
          columnCount={gridColumnCount}
          coverAspectRatio={coverAspectRatio}
          loading={loading}
          loadingMore={loadingMore}
          searching={searching}
          hasMore={hasMore}
          onLoadMore={onLoadMore}
          onItemSelect={onItemSelect}
          scrollRootRef={leftPaneRef}
        />
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左右分屏宽度"
        onPointerDown={handleDividerPointerDown}
        className={`group relative z-10 w-2 shrink-0 cursor-col-resize touch-none ${
          isDark ? "bg-neutral-800" : "bg-neutral-200"
        }`}
      >
        <div
          className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${
            isDark
              ? "bg-neutral-600 group-hover:bg-indigo-400"
              : "bg-neutral-300 group-hover:bg-indigo-500"
          }`}
        />
      </div>

      <div
        className={`min-h-0 min-w-0 flex-1 overflow-y-auto border-l px-2 sm:px-3 pb-2 ${
          isDark ? "border-neutral-800 bg-[#111113]" : "border-neutral-200 bg-neutral-50/80"
        }`}
      >
        <VideoWallFocusView
          theme={theme}
          runtimeBase={runtimeBase}
          pluginId={pluginId}
          sessions={videoSessions}
          columnCount={videoColumnCount}
          onExpandSession={onExpandSession}
          onCloseSession={onCloseSession}
          emptyMessage="挂起视频后将在此同屏播放，可多个视频并行。"
        />
      </div>
    </div>
  );
}
