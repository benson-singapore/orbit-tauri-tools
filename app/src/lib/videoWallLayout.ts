import type { ReaderSession } from "@/lib/readerSessions";

const STORAGE_KEY = "orbit.pluginVideoWallLayout";

/** Ordered session ids per column. */
export type VideoWallLayout = string[][];

type PluginVideoWallLayoutMemory = Record<string, VideoWallLayout>;

function readMemory(): PluginVideoWallLayoutMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: PluginVideoWallLayoutMemory = {};
    for (const [pluginId, layout] of Object.entries(parsed)) {
      if (typeof pluginId !== "string" || pluginId.length === 0 || !Array.isArray(layout)) {
        continue;
      }
      result[pluginId] = layout
        .filter((column): column is string[] => Array.isArray(column))
        .map(column => column.filter((id): id is string => typeof id === "string" && id.length > 0));
    }
    return result;
  } catch {
    return {};
  }
}

export function getStoredVideoWallLayout(pluginId: string): VideoWallLayout | null {
  const stored = readMemory()[pluginId];
  return stored ?? null;
}

export function persistVideoWallLayout(pluginId: string, layout: VideoWallLayout): void {
  try {
    const memory = readMemory();
    memory[pluginId] = layout;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / private mode
  }
}

export function emptyVideoWallLayout(columnCount: number): VideoWallLayout {
  return Array.from({ length: Math.max(columnCount, 0) }, () => []);
}

function normalizeColumnCount(layout: VideoWallLayout, columnCount: number): VideoWallLayout {
  if (columnCount <= 0) return [];

  const next = layout.map(column => [...column]);
  while (next.length < columnCount) {
    next.push([]);
  }

  if (next.length > columnCount) {
    const overflow = next.splice(columnCount);
    const lastColumn = next[columnCount - 1] ?? [];
    for (const column of overflow) {
      lastColumn.push(...column);
    }
    next[columnCount - 1] = lastColumn;
  }

  return next;
}

function estimateColumnHeight(
  column: string[],
  columnWidth: number,
  aspectRatios: Record<string, number>,
  defaultAspectRatio: number,
  tileMetaHeightPx: number,
  columnGapPx: number,
): number {
  if (columnWidth <= 0) return column.length;
  return column.reduce((height, sessionId) => {
    const ratio = aspectRatios[sessionId] ?? defaultAspectRatio;
    return height + columnWidth * ratio + tileMetaHeightPx + columnGapPx;
  }, 0);
}

/** Remove stale sessions and auto-place new ones on the shortest column. */
export function mergeSessionsIntoLayout(
  layout: VideoWallLayout,
  sessions: ReaderSession[],
  columnCount: number,
  columnWidth: number,
  aspectRatios: Record<string, number>,
  defaultAspectRatio: number,
  tileMetaHeightPx: number,
  columnGapPx: number,
): VideoWallLayout {
  const activeIds = new Set(sessions.map(session => session.id));
  const normalized = normalizeColumnCount(layout, columnCount).map(column =>
    column.filter(sessionId => activeIds.has(sessionId)),
  );

  const placed = new Set(normalized.flat());
  const unplaced = sessions
    .map(session => session.id)
    .filter(sessionId => !placed.has(sessionId));

  if (unplaced.length === 0) {
    return normalized;
  }

  const colHeights = normalized.map(column =>
    estimateColumnHeight(
      column,
      columnWidth,
      aspectRatios,
      defaultAspectRatio,
      tileMetaHeightPx,
      columnGapPx,
    ),
  );

  for (const sessionId of unplaced) {
    let shortest = 0;
    for (let index = 1; index < columnCount; index++) {
      if (colHeights[index] < colHeights[shortest]) {
        shortest = index;
      }
    }

    const column = normalized[shortest] ?? [];
    column.push(sessionId);
    normalized[shortest] = column;

    const ratio = aspectRatios[sessionId] ?? defaultAspectRatio;
    colHeights[shortest] += columnWidth > 0
      ? columnWidth * ratio + tileMetaHeightPx + columnGapPx
      : 1;
  }

  return normalized;
}

export function moveSessionInLayout(
  layout: VideoWallLayout,
  sessionId: string,
  toColumn: number,
  beforeSessionId: string | null,
  columnCount: number,
): VideoWallLayout {
  const next = normalizeColumnCount(layout, columnCount).map(column =>
    column.filter(id => id !== sessionId),
  );

  if (toColumn < 0 || toColumn >= columnCount) {
    return next;
  }

  const targetColumn = next[toColumn] ?? [];
  if (beforeSessionId === null) {
    targetColumn.push(sessionId);
  } else {
    const insertIndex = targetColumn.indexOf(beforeSessionId);
    if (insertIndex >= 0) {
      targetColumn.splice(insertIndex, 0, sessionId);
    } else {
      targetColumn.push(sessionId);
    }
  }
  next[toColumn] = targetColumn;
  return next;
}

export function layoutToSessionColumns(
  layout: VideoWallLayout,
  sessions: ReaderSession[],
): ReaderSession[][] {
  const sessionById = new Map(sessions.map(session => [session.id, session]));
  return layout.map(column =>
    column
      .map(sessionId => sessionById.get(sessionId))
      .filter((session): session is ReaderSession => session !== undefined),
  );
}
