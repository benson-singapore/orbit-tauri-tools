import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from "react";
import { isDarkTheme } from "@/lib/themeMode";
import { Icon } from "@/components/Icon";
import {
  useVideoSessionMountRegistry,
} from "@/components/VideoWallMountContext";
import { displayImageUrl } from "@/lib/imageProxy";
import type { ReaderSession } from "@/lib/readerSessions";
import type { GridColumnCount } from "@/lib/gridColumnCount";
import {
  DEFAULT_VIDEO_HEIGHT_RATIO,
  getReportedSessionAspectRatio,
  heightOverWidthToCssAspectRatio,
  probeImageAspectRatio,
  probeVideoAspectRatio,
  resolveArticleAspectRatioSources,
  subscribeSessionVideoAspectRatios,
} from "@/lib/videoAspectRatio";
import {
  emptyVideoWallLayout,
  getStoredVideoWallLayout,
  layoutToSessionColumns,
  mergeSessionsIntoLayout,
  moveSessionInLayout,
  persistVideoWallLayout,
  type VideoWallLayout,
} from "@/lib/videoWallLayout";
import type { ThemeMode } from "@/types";

interface VideoWallFocusViewProps {
  theme: ThemeMode;
  runtimeBase?: string | null;
  pluginId?: string;
  sessions: ReaderSession[];
  columnCount: GridColumnCount;
  onExpandSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  emptyMessage?: string;
}

const COLUMN_GAP_PX = 12;
const VIDEO_TILE_META_HEIGHT_PX = 64;
const DRAG_MIME = "application/x-orbit-video-wall-session";

type DropTarget = {
  columnIndex: number;
  beforeSessionId: string | null;
};

function isSameDropTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.columnIndex === b.columnIndex && a.beforeSessionId === b.beforeSessionId;
}

function VideoWallTile({
  theme,
  session,
  aspectRatio,
  dragging,
  dropBefore,
  onExpand,
  onClose,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  theme: ThemeMode;
  session: ReaderSession;
  aspectRatio: number;
  dragging: boolean;
  dropBefore: boolean;
  onExpand: () => void;
  onClose: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  const { registerMount } = useVideoSessionMountRegistry();
  const isDark = isDarkTheme(theme);

  const mountRef = useCallback(
    (element: HTMLDivElement | null) => {
      registerMount(session.id, "wall", element);
    },
    [registerMount, session.id],
  );

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md ${
        dragging ? "opacity-45" : ""
      } ${
        dropBefore ? "ring-2 ring-[#5856D6]/45" : ""
      } ${
        isDark
          ? "border-neutral-800 bg-[#1c1c1e]"
          : "border-neutral-200 bg-white"
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dropBefore ? (
        <div className="h-1 shrink-0 bg-[#5856D6]/70" aria-hidden />
      ) : null}

      <div
        ref={mountRef}
        className="relative w-full bg-neutral-950"
        style={{ aspectRatio: heightOverWidthToCssAspectRatio(aspectRatio) }}
        data-video-wall-mount={session.id}
      />

      <div className="flex items-start gap-2 p-2.5 min-w-0">
        <button
          type="button"
          draggable
          onDragStart={event => {
            event.dataTransfer.setData(DRAG_MIME, session.id);
            event.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          className={`shrink-0 px-1.5 py-1 rounded-md border text-[10px] leading-none cursor-grab active:cursor-grabbing transition-colors ${
            isDark
              ? "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
              : "border-neutral-200 text-neutral-500 hover:bg-neutral-100"
          }`}
          title="拖拽换位"
          aria-label="拖拽换位"
          onClick={event => event.stopPropagation()}
        >
          ⋮⋮
        </button>
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
  pluginId,
  sessions,
  columnCount,
  onExpandSession,
  onCloseSession,
  emptyMessage = "暂无挂起的视频。请先打开视频并挂起到侧栏。",
}: VideoWallFocusViewProps) {
  const isDark = isDarkTheme(theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const probedSessionIdsRef = useRef(new Set<string>());
  const loadedPluginIdRef = useRef<string | undefined>(undefined);
  const [containerWidth, setContainerWidth] = useState(0);
  const [probedAspectRatios, setProbedAspectRatios] = useState<Record<string, number>>({});
  const [layout, setLayout] = useState<VideoWallLayout>(() => emptyVideoWallLayout(columnCount));
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  useSyncExternalStore(
    subscribeSessionVideoAspectRatios,
    () => reportedRatioSnapshot(sessions),
    () => reportedRatioSnapshot(sessions),
  );

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
    const activeIds = new Set(sessions.map(session => session.id));

    for (const sessionId of probedSessionIdsRef.current) {
      if (!activeIds.has(sessionId)) {
        probedSessionIdsRef.current.delete(sessionId);
      }
    }

    for (const session of sessions) {
      const sessionId = session.id;
      if (
        probedSessionIdsRef.current.has(sessionId)
        || getReportedSessionAspectRatio(sessionId) !== undefined
      ) {
        continue;
      }

      probedSessionIdsRef.current.add(sessionId);

      const { videoUrl, imageUrl, initial } = resolveArticleAspectRatioSources(
        session.article,
      );

      if (initial !== null) {
        setProbedAspectRatios(prev => (
          prev[sessionId] === initial ? prev : { ...prev, [sessionId]: initial }
        ));
      }

      if (videoUrl) {
        void probeVideoAspectRatio(videoUrl).then(ratio => {
          if (cancelled || ratio === null) return;
          setProbedAspectRatios(prev => (
            prev[sessionId] === ratio ? prev : { ...prev, [sessionId]: ratio }
          ));
        });
      }

      if (imageUrl && !videoUrl) {
        void probeImageAspectRatio(displayImageUrl(runtimeBase, imageUrl)).then(ratio => {
          if (cancelled || ratio === null) return;
          setProbedAspectRatios(prev => {
            if (prev[sessionId] !== undefined) return prev;
            return { ...prev, [sessionId]: ratio };
          });
        });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [sessions, runtimeBase]);

  const aspectRatios = useMemo(() => {
    const merged: Record<string, number> = { ...probedAspectRatios };

    for (const session of sessions) {
      const reported = getReportedSessionAspectRatio(session.id);
      if (reported !== undefined) {
        merged[session.id] = reported;
      }
    }

    return merged;
  }, [sessions, probedAspectRatios]);

  const defaultAspectRatio = useMemo(() => {
    const ratios = Object.values(aspectRatios);
    if (ratios.length === 0) return DEFAULT_VIDEO_HEIGHT_RATIO;
    return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  }, [aspectRatios]);

  const columnWidth = useMemo(() => {
    if (containerWidth <= 0 || columnCount <= 0) return 0;
    return (containerWidth - COLUMN_GAP_PX * (columnCount - 1)) / columnCount;
  }, [containerWidth, columnCount]);

  useEffect(() => {
    setLayout(prev => {
      let base = prev;
      if (loadedPluginIdRef.current !== pluginId) {
        loadedPluginIdRef.current = pluginId;
        base = pluginId
          ? (getStoredVideoWallLayout(pluginId) ?? emptyVideoWallLayout(columnCount))
          : emptyVideoWallLayout(columnCount);
      }

      const next = mergeSessionsIntoLayout(
        base,
        sessions,
        columnCount,
        columnWidth,
        aspectRatios,
        defaultAspectRatio,
        VIDEO_TILE_META_HEIGHT_PX,
        COLUMN_GAP_PX,
      );
      if (pluginId) {
        persistVideoWallLayout(pluginId, next);
      }
      return layoutsEqual(base, next) ? base : next;
    });
  }, [
    sessions,
    columnCount,
    columnWidth,
    aspectRatios,
    defaultAspectRatio,
    pluginId,
  ]);

  const sessionColumns = useMemo(
    () => layoutToSessionColumns(layout, sessions),
    [layout, sessions],
  );

  const clearDragState = useCallback(() => {
    setDraggingSessionId(null);
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((target: DropTarget) => {
    if (!draggingSessionId) {
      clearDragState();
      return;
    }

    setLayout(prev => {
      const next = moveSessionInLayout(
        prev,
        draggingSessionId,
        target.columnIndex,
        target.beforeSessionId,
        columnCount,
      );
      if (pluginId) {
        persistVideoWallLayout(pluginId, next);
      }
      return next;
    });
    clearDragState();
  }, [clearDragState, columnCount, draggingSessionId, pluginId]);

  const handleColumnDragOver = useCallback((
    event: DragEvent<HTMLDivElement>,
    columnIndex: number,
  ) => {
    if (!draggingSessionId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const nextTarget: DropTarget = { columnIndex, beforeSessionId: null };
    setDropTarget(prev => (isSameDropTarget(prev, nextTarget) ? prev : nextTarget));
  }, [draggingSessionId]);

  const handleTileDragOver = useCallback((
    event: DragEvent<HTMLElement>,
    columnIndex: number,
    beforeSessionId: string,
  ) => {
    if (!draggingSessionId || draggingSessionId === beforeSessionId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const nextTarget: DropTarget = { columnIndex, beforeSessionId };
    setDropTarget(prev => (isSameDropTarget(prev, nextTarget) ? prev : nextTarget));
  }, [draggingSessionId]);

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
        {sessionColumns.map((column, columnIndex) => {
          const columnDropActive = dropTarget?.columnIndex === columnIndex
            && dropTarget.beforeSessionId === null;

          return (
            <div
              key={columnIndex}
              className={`flex-1 min-w-0 flex flex-col gap-3 min-h-[72px] rounded-lg transition-colors ${
                columnDropActive ? "bg-[#5856D6]/8 ring-1 ring-[#5856D6]/25" : ""
              }`}
              onDragOver={event => handleColumnDragOver(event, columnIndex)}
              onDragLeave={() => {
                setDropTarget(prev => (
                  prev?.columnIndex === columnIndex && prev.beforeSessionId === null
                    ? null
                    : prev
                ));
              }}
              onDrop={event => {
                event.preventDefault();
                handleDrop({ columnIndex, beforeSessionId: null });
              }}
            >
              {column.map(session => (
                <VideoWallTile
                  key={session.id}
                  theme={theme}
                  session={session}
                  aspectRatio={aspectRatios[session.id] ?? defaultAspectRatio}
                  dragging={draggingSessionId === session.id}
                  dropBefore={
                    dropTarget?.columnIndex === columnIndex
                    && dropTarget.beforeSessionId === session.id
                  }
                  onExpand={() => onExpandSession(session.id)}
                  onClose={() => onCloseSession(session.id)}
                  onDragStart={() => setDraggingSessionId(session.id)}
                  onDragEnd={clearDragState}
                  onDragOver={event => handleTileDragOver(event, columnIndex, session.id)}
                  onDragLeave={() => {
                    setDropTarget(prev => (
                      prev?.beforeSessionId === session.id ? null : prev
                    ));
                  }}
                  onDrop={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleDrop({ columnIndex, beforeSessionId: session.id });
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function layoutsEqual(a: VideoWallLayout, b: VideoWallLayout): boolean {
  if (a.length !== b.length) return false;
  return a.every((column, index) => {
    const other = b[index] ?? [];
    if (column.length !== other.length) return false;
    return column.every((sessionId, sessionIndex) => sessionId === other[sessionIndex]);
  });
}

function reportedRatioSnapshot(sessions: ReaderSession[]): number {
  let checksum = 0;
  for (const session of sessions) {
    const ratio = getReportedSessionAspectRatio(session.id);
    if (ratio !== undefined) {
      checksum += ratio * 1000;
    }
  }
  return checksum;
}
