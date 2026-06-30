import type { Article, PluginMediaType } from "@/types";

export function isSerialMediaType(mediaType?: string): mediaType is "manga" | "novel" {
  return mediaType === "manga" || mediaType === "novel";
}

export function resolveSerialChapterItemLabel(
  mediaType?: string,
  itemLabel?: string,
): string {
  if (itemLabel?.trim()) return itemLabel.trim();
  return mediaType === "novel" ? "章" : "话";
}

export function resolveActiveChapterIndex(
  chapterItems: Article[],
  activeChapterId: string | null | undefined,
): number {
  if (!activeChapterId) return -1;
  return chapterItems.findIndex(item => item.id === activeChapterId);
}

export function resolveSerialChapterNeighbors(options: {
  chapterItems: Article[];
  activeChapterId: string | null | undefined;
  hasMoreChapters?: boolean;
}): {
  prev: Article | null;
  next: Article | null;
  activeIndex: number | null;
  canLoadMoreNext: boolean;
} {
  if (!options.activeChapterId) {
    return { prev: null, next: null, activeIndex: null, canLoadMoreNext: false };
  }
  const idx = resolveActiveChapterIndex(options.chapterItems, options.activeChapterId);
  if (idx < 0) {
    return { prev: null, next: null, activeIndex: null, canLoadMoreNext: false };
  }
  const hasMore = Boolean(options.hasMoreChapters);
  return {
    prev: idx > 0 ? options.chapterItems[idx - 1] : null,
    next: idx < options.chapterItems.length - 1 ? options.chapterItems[idx + 1] : null,
    activeIndex: idx,
    canLoadMoreNext: idx >= options.chapterItems.length - 1 && hasMore,
  };
}

export function isNovelIntroChapter(
  mediaType: PluginMediaType | undefined,
  chapterItems: Article[],
  activeChapterId: string | null | undefined,
): boolean {
  if (mediaType !== "novel") return false;
  return resolveActiveChapterIndex(chapterItems, activeChapterId) === 0;
}

export function isSerialIntroPage(options: {
  mediaType?: PluginMediaType;
  chaptersActive: boolean;
  chapterItems: Article[];
  activeChapterId: string | null | undefined;
  isComicReaderContent: boolean;
  hasDisplayContent: boolean;
}): boolean {
  if (!options.chaptersActive || !options.hasDisplayContent) return false;
  if (options.mediaType === "manga") {
    return !options.isComicReaderContent;
  }
  if (options.mediaType === "novel") {
    return isNovelIntroChapter(
      options.mediaType,
      options.chapterItems,
      options.activeChapterId,
    );
  }
  return false;
}

export function isNovelChapterReading(options: {
  mediaType?: PluginMediaType;
  chaptersActive: boolean;
  chapterItems: Article[];
  activeChapterId: string | null | undefined;
}): boolean {
  if (options.mediaType !== "novel" || !options.chaptersActive) return false;
  const idx = resolveActiveChapterIndex(options.chapterItems, options.activeChapterId);
  return idx > 0;
}

export function shouldShowSerialChapterPager(options: {
  mediaType?: PluginMediaType;
  chaptersActive: boolean;
  chapterItems: Article[];
  activeChapterId: string | null | undefined;
  isComicReaderContent: boolean;
  streamActive: boolean;
}): boolean {
  if (!options.chaptersActive) return false;
  if (options.streamActive && options.mediaType !== "novel") return false;
  if (options.isComicReaderContent) return true;
  return isNovelChapterReading({
    mediaType: options.mediaType,
    chaptersActive: options.chaptersActive,
    chapterItems: options.chapterItems,
    activeChapterId: options.activeChapterId,
  });
}
