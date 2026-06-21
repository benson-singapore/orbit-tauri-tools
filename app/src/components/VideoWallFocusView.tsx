import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  useVideoSessionMountRegistry,
} from "@/components/VideoWallMountContext";
import { displayImageUrl } from "@/lib/imageProxy";
import type { ReaderSession } from "@/lib/readerSessions";
import type { GridColumnCount } from "@/lib/gridColumnCount";
import type { ThemeMode } from "@/types";

interface VideoWallFocusViewProps {
  theme: ThemeMode;
  runtimeBase?: string | null;
  sessions: ReaderSession[];
  columnCount: GridColumnCount;
  onExpandSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  emptyMessage?: string;
}

const COLUMN_GAP_PX = 12;
const VIDEO_TILE_META_HEIGHT_PX = 64;
const DEFAULT_ASPECT_RATIO = 9 / 16;

type SessionColumnEntry = { session: ReaderSession };

function distributeShortestColumn(
  entries: SessionColumnEntry[],
  columnCount: number,
  columnWidth: number,
  aspectRatios: Record<string, number>,
  defaultAspectRatio: number,
): SessionColumnEntry[][] {
  const cols: SessionColumnEntry[][] = Array.from({ length: columnCount }, () => []);
  const colHeights = Array(columnCount).fill(0);

  for (const entry of entries) {
    const ratio = aspectRatios[entry.session.id] ?? defaultAspectRatio;
    let shortest = 0;
    for (let i = 1; i < columnCount; i++) {
      if (colHeights[i] < colHeights[shortest]) {
        shortest = i;
      }
    }
    cols[shortest].push(entry);
    colHeights[shortest] += columnWidth * ratio + VIDEO_TILE_META_HEIGHT_PX + COLUMN_GAP_PX;
  }

  return cols;
}

function VideoWallTile({
  theme,
  session,
  aspectRatio,
  onExpand,
  onClose,
}: {
  theme: ThemeMode;
  session: ReaderSession;
  aspectRatio: number;
  onExpand: () => void;
  onClose: () => void;
}) {
  const { registerMount } = useVideoSessionMountRegistry();
  const isDark = theme === "dark";

  const mountRef = useCallback(
    (element: HTMLDivElement | null) => {
      registerMount(session.id, "wall", element);
    },
    [registerMount, session.id],
  );

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md ${
        isDark
          ? "border-neutral-800 bg-[#1c1c1e]"
          : "border-neutral-200 bg-white"
      }`}
    >
      <div
        ref={mountRef}
        className="relative w-full bg-neutral-950"
        style={{ aspectRatio: `${1 / aspectRatio}` }}
        data-video-wall-mount={session.id}
      />

      <div className="flex items-start gap-2 p-2.5 min-w-0">
        <button
          type="button"
          onClick={onExpand}
          className="min-w-0 flex-1 text-left"
          title="展开阅读"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 truncate">
            {session.article.pluginName}
          </p>
          <p className="text-xs font-semibold leading-snug line-clamp-2 mt-0.5">
            {session.article.title}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onExpand}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark ? "hover:bg-neutral-800" : "hover:bg-neutral-100"
            }`}
            title="展开"
            aria-label="展开"
          >
            <Icon name="expand" className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark ? "hover:bg-neutral-800" : "hover:bg-neutral-100"
            }`}
            title="关闭"
            aria-label="关闭"
          >
            <Icon name="close" className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function VideoWallFocusView({
  theme,
  runtimeBase = null,
  sessions,
  columnCount,
  onExpandSession,
  onCloseSession,
  emptyMessage = "暂无挂起的视频。请先打开视频并挂起到侧栏。",
}: VideoWallFocusViewProps) {
  const isDark = theme === "dark";
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => setContainerWidth(element.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    for (const session of sessions) {
      const imageUrl = session.article.image?.trim();
      if (!imageUrl) continue;

      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const { naturalWidth, naturalHeight } = img;
        if (naturalWidth <= 0 || naturalHeight <= 0) return;
        const ratio = naturalHeight / naturalWidth;
        setAspectRatios(prev => (
          prev[session.id] === ratio ? prev : { ...prev, [session.id]: ratio }
        ));
      };
      img.src = displayImageUrl(runtimeBase, imageUrl);
    }

    return () => {
      cancelled = true;
    };
  }, [sessions, runtimeBase]);

  const defaultAspectRatio = useMemo(() => {
    const ratios = Object.values(aspectRatios);
    if (ratios.length === 0) return DEFAULT_ASPECT_RATIO;
    return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  }, [aspectRatios]);

  const columnWidth = useMemo(() => {
    if (containerWidth <= 0 || columnCount <= 0) return 0;
    return (containerWidth - COLUMN_GAP_PX * (columnCount - 1)) / columnCount;
  }, [containerWidth, columnCount]);

  const sessionColumns = useMemo(() => {
    const entries: SessionColumnEntry[] = sessions.map(session => ({ session }));

    if (columnWidth <= 0) {
      const cols = Array.from({ length: columnCount }, () => [] as SessionColumnEntry[]);
      entries.forEach((entry, index) => {
        cols[index % columnCount].push(entry);
      });
      return cols;
    }

    return distributeShortestColumn(
      entries,
      columnCount,
      columnWidth,
      aspectRatios,
      defaultAspectRatio,
    );
  }, [sessions, columnCount, columnWidth, aspectRatios, defaultAspectRatio]);

  if (sessions.length === 0) {
    return (
      <div
        className={`rounded-xl border border-dashed px-6 py-16 text-center text-sm ${
          isDark
            ? "border-neutral-700 text-neutral-400"
            : "border-neutral-200 text-neutral-500"
        }`}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full pb-4">
      <div className="flex w-full gap-3 items-start">
        {sessionColumns.map((column, columnIndex) => (
          <div key={columnIndex} className="flex-1 min-w-0 flex flex-col gap-3">
            {column.map(({ session }) => (
              <VideoWallTile
                key={session.id}
                theme={theme}
                session={session}
                aspectRatio={aspectRatios[session.id] ?? defaultAspectRatio}
                onExpand={() => onExpandSession(session.id)}
                onClose={() => onCloseSession(session.id)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
