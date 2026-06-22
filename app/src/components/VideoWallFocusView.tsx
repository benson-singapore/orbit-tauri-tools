import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
  probeImageAspectRatio,
  probeVideoAspectRatio,
  resolveArticleAspectRatioSources,
  subscribeSessionVideoAspectRatios,
} from "@/lib/videoAspectRatio";
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

type SessionColumnEntry = { session: ReaderSession };

function estimateTileHeight(
  sessionId: string,
  columnWidth: number,
  aspectRatios: Record<string, number>,
  defaultAspectRatio: number,
): number {
  const ratio = aspectRatios[sessionId] ?? defaultAspectRatio;
  return columnWidth * ratio + VIDEO_TILE_META_HEIGHT_PX + COLUMN_GAP_PX;
}

function assignSessionColumns(
  entries: SessionColumnEntry[],
  columnCount: number,
  columnWidth: number,
  aspectRatios: Record<string, number>,
  defaultAspectRatio: number,
  assignments: Map<string, number>,
): SessionColumnEntry[][] {
  const cols: SessionColumnEntry[][] = Array.from({ length: columnCount }, () => []);
  const colHeights = Array(columnCount).fill(0);

  const activeIds = new Set(entries.map(entry => entry.session.id));
  for (const sessionId of assignments.keys()) {
    if (!activeIds.has(sessionId)) {
      assignments.delete(sessionId);
    }
  }

  for (const [sessionId, columnIndex] of assignments) {
    if (columnIndex >= columnCount) {
      assignments.delete(sessionId);
    }
  }

  const unassigned: SessionColumnEntry[] = [];

  for (const entry of entries) {
    const columnIndex = assignments.get(entry.session.id);
    if (columnIndex === undefined) {
      unassigned.push(entry);
      continue;
    }

    cols[columnIndex].push(entry);
    colHeights[columnIndex] += estimateTileHeight(
      entry.session.id,
      columnWidth,
      aspectRatios,
      defaultAspectRatio,
    );
  }

  for (const entry of unassigned) {
    let shortest = 0;
    for (let index = 1; index < columnCount; index++) {
      if (colHeights[index] < colHeights[shortest]) {
        shortest = index;
      }
    }

    assignments.set(entry.session.id, shortest);
    cols[shortest].push(entry);
    colHeights[shortest] += estimateTileHeight(
      entry.session.id,
      columnWidth,
      aspectRatios,
      defaultAspectRatio,
    );
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
  const isDark = isDarkTheme(theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const columnAssignmentsRef = useRef(new Map<string, number>());
  const probedSessionIdsRef = useRef(new Set<string>());
  const [containerWidth, setContainerWidth] = useState(0);
  const [probedAspectRatios, setProbedAspectRatios] = useState<Record<string, number>>({});

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
    columnAssignmentsRef.current.clear();
  }, [columnCount]);

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

      if (imageUrl) {
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

  const sessionColumns = useMemo(() => {
    const entries: SessionColumnEntry[] = sessions.map(session => ({ session }));

    if (columnWidth <= 0) {
      const cols = Array.from({ length: columnCount }, () => [] as SessionColumnEntry[]);
      entries.forEach((entry, index) => {
        cols[index % columnCount].push(entry);
      });
      return cols;
    }

    return assignSessionColumns(
      entries,
      columnCount,
      columnWidth,
      aspectRatios,
      defaultAspectRatio,
      columnAssignmentsRef.current,
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
