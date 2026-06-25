import type {
  Article,
  PlaybackMode,
  PlaybackProgress,
  PlaybackRecord,
  PlaybackResumeIntent,
  ProgressArticle,
  ProgressManga,
  ProgressTime,
} from "@/types";
import { fetchFeedItem } from "@/lib/feed";
import {
  collectComicLazyImages,
  resolveComicLazyPageIndex,
  syncComicLazyImages,
  syncComicLazyImagesForChapterPage,
} from "@/lib/comicChapterContent";
import { getPlayback } from "@/lib/playback";
import {
  dispatchPlaybackResume,
  getSessionPlaybackSnapshot,
  updateSessionPlaybackSnapshot,
} from "@/lib/sessionVideoProgress";

export function isProgressTime(progress?: PlaybackProgress): progress is ProgressTime {
  return Boolean(progress && ("position" in progress || "duration" in progress));
}

export function isProgressArticle(progress?: PlaybackProgress): progress is ProgressArticle {
  return Boolean(progress && ("offset" in progress || "anchor" in progress));
}

export function isProgressManga(progress?: PlaybackProgress): progress is ProgressManga {
  return Boolean(progress && "page" in progress);
}

export function hasMeaningfulProgress(progress?: PlaybackProgress): boolean {
  if (!progress) return false;
  if (isProgressTime(progress)) {
    // Only persist after the viewer has actually advanced playback.
    return (progress.position ?? 0) > 0;
  }
  if (isProgressArticle(progress)) {
    return (progress.offset ?? 0) > 0 || Boolean(progress.anchor?.trim());
  }
  if (isProgressManga(progress)) {
    return (progress.page ?? 0) > 0;
  }
  return Object.keys(progress).length > 0;
}

export function formatPlaybackProgressLabel(
  mode: PlaybackMode,
  progress?: PlaybackProgress,
): string {
  if (!progress) return "";
  if (mode === "video" || mode === "audio") {
    if (!isProgressTime(progress)) return "";
    const pos = progress.position ?? 0;
    const dur = progress.duration;
    const posLabel = formatSeconds(pos);
    if (dur && dur > 0) {
      return `${posLabel} / ${formatSeconds(dur)}`;
    }
    return posLabel;
  }
  if (mode === "article" && isProgressArticle(progress)) {
    if (progress.total && progress.offset != null) {
      const pct = Math.min(100, Math.round((progress.offset / progress.total) * 100));
      return `已读 ${pct}%`;
    }
    if (progress.offset != null) {
      return `读到第 ${progress.offset} 字`;
    }
    return "";
  }
  if (mode === "manga" && isProgressManga(progress)) {
    const page = progress.page ?? 1;
    if (progress.totalPages) {
      return `第 ${page} / ${progress.totalPages} 页`;
    }
    return `第 ${page} 页`;
  }
  return "";
}

function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function seedPlaybackResumeSnapshot(
  sessionId: string | undefined,
  progress: PlaybackProgress | undefined,
  mode?: PlaybackMode,
): void {
  if (!sessionId || !progress) return;
  const effectiveMode = mode ?? "video";
  if (effectiveMode !== "video" && effectiveMode !== "audio") return;
  if (!isProgressTime(progress)) return;
  const position = progress.position ?? 0;
  if (position <= 0) return;
  updateSessionPlaybackSnapshot(sessionId, {
    currentTime: position,
    playing: false,
  });
}

export function applyVideoResume(
  sessionId: string | undefined,
  contentRoot: HTMLElement | null,
  position: number,
): void {
  if (sessionId && position > 0) {
    updateSessionPlaybackSnapshot(sessionId, {
      currentTime: position,
      playing: false,
    });
    dispatchPlaybackResume(sessionId, position);
  }
  const video = contentRoot?.querySelector("video");
  if (video && position > 0.5) {
    video.dataset.orbitResumeTime = String(position);
    const seek = () => {
      try {
        video.currentTime = position;
      } catch {
        // ignore seek before metadata
      }
    };
    if (video.readyState >= 1) {
      seek();
    } else {
      video.addEventListener("loadedmetadata", seek, { once: true });
      video.addEventListener("canplay", seek, { once: true });
    }
  }
}

export function applyAudioResume(contentRoot: HTMLElement | null, position: number): void {
  const audio = contentRoot?.querySelector("audio");
  if (!audio || position <= 0.5) return;
  const seek = () => {
    try {
      audio.currentTime = position;
    } catch {
      // ignore
    }
  };
  if (audio.readyState >= 1) {
    seek();
  } else {
    audio.addEventListener("loadedmetadata", seek, { once: true });
  }
}

export function collectArticleScrollProgress(root: HTMLElement | null): ProgressArticle {
  if (!root) return {};
  const scrollParent = findScrollParent(root) ?? root;
  const total = countTextCharacters(root);
  const offset = estimateCharOffsetFromScroll(root, scrollParent);
  return {
    offset,
    total: total > 0 ? total : undefined,
  };
}

export function applyArticleResume(root: HTMLElement | null, progress: ProgressArticle): void {
  if (!root) return;
  if (progress.anchor) {
    const anchor = root.querySelector(`#${CSS.escape(progress.anchor)}`);
    anchor?.scrollIntoView({ block: "start" });
    return;
  }
  if (progress.offset != null && progress.offset > 0) {
    scrollToCharOffset(root, progress.offset);
  }
}

function resolveViewportMetrics(scrollRoot?: HTMLElement | null): {
  focusLine: number;
  isInViewport: (rect: DOMRect) => boolean;
} {
  if (scrollRoot) {
    const rootRect = scrollRoot.getBoundingClientRect();
    const focusLine = rootRect.top + rootRect.height * 0.35;
    return {
      focusLine,
      isInViewport: rect => rect.bottom > rootRect.top && rect.top < rootRect.bottom,
    };
  }
  const focusLine = window.innerHeight * 0.35;
  return {
    focusLine,
    isInViewport: rect => rect.bottom > 0 && rect.top < window.innerHeight,
  };
}

function findVisibleComicChapterBlock(
  streamRoot: HTMLElement,
  scrollRoot?: HTMLElement | null,
): HTMLElement | null {
  const blocks = Array.from(
    streamRoot.querySelectorAll<HTMLElement>("[data-comic-chapter]"),
  );
  if (blocks.length === 0) return null;

  const { focusLine, isInViewport } = resolveViewportMetrics(scrollRoot);
  let bestBlock: HTMLElement | null = null;
  let bestDistance = Infinity;

  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (!isInViewport(rect)) continue;
    const mid = (rect.top + rect.bottom) / 2;
    const distance = Math.abs(mid - focusLine);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestBlock = block;
    }
  }

  return bestBlock ?? blocks[blocks.length - 1] ?? null;
}

export function resolveComicStreamChapterContentRoot(
  streamRoot: HTMLElement | null,
  chapterId?: string,
  scrollRoot?: HTMLElement | null,
): HTMLElement | null {
  if (!streamRoot) return null;
  if (chapterId) {
    const block = streamRoot.querySelector<HTMLElement>(
      `[data-comic-chapter="${chapterId}"]`,
    );
    return block?.querySelector<HTMLElement>(".article-content") ?? null;
  }
  const visibleBlock = findVisibleComicChapterBlock(streamRoot, scrollRoot);
  return visibleBlock?.querySelector<HTMLElement>(".article-content") ?? null;
}

export function collectMangaStreamProgress(
  streamRoot: HTMLElement | null,
  scrollRoot?: HTMLElement | null,
): {
  progress: ProgressManga;
  chapterId?: string;
} {
  if (!streamRoot) return { progress: {} };
  const visibleBlock = findVisibleComicChapterBlock(streamRoot, scrollRoot);
  const contentRoot = visibleBlock?.querySelector<HTMLElement>(".article-content") ?? null;
  return {
    progress: collectMangaPageProgress(contentRoot, scrollRoot),
    chapterId: visibleBlock?.dataset.comicChapter,
  };
}

export function collectMangaPageProgress(
  root: HTMLElement | null,
  scrollRoot?: HTMLElement | null,
): ProgressManga {
  if (!root) return {};
  if (root.dataset.comicStream === "true") {
    return collectMangaStreamProgress(root, scrollRoot).progress;
  }
  const images = getMangaImages(root);
  if (images.length === 0) return {};
  const lazyImages = collectComicLazyImages(root);
  if (lazyImages.length > 0) {
    const pageIndex = resolveComicLazyPageIndex(images, scrollRoot ?? null);
    return { page: pageIndex + 1, totalPages: images.length };
  }
  const { focusLine } = resolveViewportMetrics(scrollRoot);
  let page = 1;
  for (let i = 0; i < images.length; i++) {
    const rect = images[i].getBoundingClientRect();
    if (rect.top <= focusLine && rect.bottom >= focusLine) {
      page = i + 1;
      break;
    }
    if (rect.top > focusLine) {
      page = Math.max(1, i);
      break;
    }
    if (i === images.length - 1) {
      page = images.length;
    }
  }
  return { page, totalPages: images.length };
}

export function applyMangaResume(
  root: HTMLElement | null,
  progress: ProgressManga,
  scrollRoot?: HTMLElement | null,
): void {
  if (!root || !progress.page) return;

  const scrollToPage = (): boolean => {
    const images = getMangaImages(root);
    const img = images[progress.page! - 1];
    if (!img) return false;

    if (scrollRoot) {
      const rootRect = scrollRoot.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      scrollRoot.scrollTop += imgRect.top - rootRect.top;
    } else {
      img.scrollIntoView({ block: "start" });
    }
    return true;
  };

  if (scrollToPage()) return;

  const images = Array.from(root.querySelectorAll("img"));
  if (images.length === 0) return;

  let pending = 0;
  const tryScroll = () => {
    scrollToPage();
  };
  for (const img of images) {
    if (img.complete) continue;
    pending += 1;
    img.addEventListener("load", tryScroll, { once: true });
    img.addEventListener("error", tryScroll, { once: true });
  }
  if (pending === 0) {
    window.requestAnimationFrame(tryScroll);
  }
}

export function collectTimeProgress(
  sessionId: string | undefined,
  contentRoot: HTMLElement | null,
): ProgressTime {
  if (sessionId) {
    const snapshot = getSessionPlaybackSnapshot(sessionId);
    if (snapshot && snapshot.currentTime > 0) {
      const video = contentRoot?.querySelector("video");
      return {
        position: snapshot.currentTime,
        duration: video && Number.isFinite(video.duration) ? video.duration : undefined,
      };
    }
  }
  const video = contentRoot?.querySelector("video");
  if (video) {
    return {
      position: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : undefined,
    };
  }
  const audio = contentRoot?.querySelector("audio");
  if (audio) {
    return {
      position: audio.currentTime,
      duration: Number.isFinite(audio.duration) ? audio.duration : undefined,
    };
  }
  return {};
}

export function isComicContentRoot(root: HTMLElement | null | undefined): boolean {
  if (!root) return false;
  if (root.dataset.comicStream === "true") return true;
  if (root.dataset.comicPages === "true") return true;
  return Boolean(root.querySelector(".comic-reader, img[data-comic-lazy], [data-comic-pages]"));
}

function getMangaImages(root: HTMLElement): HTMLImageElement[] {
  const lazy = collectComicLazyImages(root);
  if (lazy.length > 0) return lazy;

  const comicImages = Array.from(
    root.querySelectorAll<HTMLImageElement>(
      ".comic-reader img, .comic-chapter-pages img, [data-comic-pages] img",
    ),
  );
  const images = comicImages.length > 0
    ? comicImages
    : Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  const visible = images.filter(img => img.offsetParent !== null);
  return visible.length > 0 ? visible : images;
}

function findScrollParent(node: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = node;
  while (el) {
    const style = window.getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY)) return el;
    el = el.parentElement;
  }
  return null;
}

export function findArticleScrollParent(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null;
  return findScrollParent(node);
}

function countTextCharacters(root: HTMLElement): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let count = 0;
  while (walker.nextNode()) {
    count += (walker.currentNode.textContent ?? "").length;
  }
  return count;
}

function estimateCharOffsetFromScroll(root: HTMLElement, scrollParent: HTMLElement): number {
  const maxScroll = scrollParent.scrollHeight - scrollParent.clientHeight;
  if (maxScroll <= 0) return 0;
  const ratio = scrollParent.scrollTop / maxScroll;
  return Math.round(countTextCharacters(root) * ratio);
}

function scrollToCharOffset(root: HTMLElement, targetOffset: number): void {
  const scrollParent = findScrollParent(root) ?? root;
  const total = countTextCharacters(root);
  if (total <= 0) return;
  const ratio = Math.min(1, targetOffset / total);
  const maxScroll = scrollParent.scrollHeight - scrollParent.clientHeight;
  scrollParent.scrollTop = maxScroll * ratio;
}

function scheduleMangaResumeRetries(run: () => void): void {
  run();
  window.requestAnimationFrame(run);
  window.setTimeout(run, 400);
  window.setTimeout(run, 1200);
}

function bindMangaResumeRetries(
  images: HTMLImageElement[],
  pageIndex: number,
  run: () => void,
): void {
  const target = images[pageIndex];
  if (!target) return;
  target.addEventListener("load", run, { once: true });
  target.addEventListener("error", run, { once: true });
}

export function applyMangaFlatPagesResume(
  root: HTMLElement | null,
  progress: ProgressManga,
  scrollRoot?: HTMLElement | null,
  runtimeBase?: string | null,
): void {
  if (!root || !progress.page) return;

  const lazyImages = collectComicLazyImages(root);
  if (lazyImages.length > 0) {
    syncComicLazyImages(root, scrollRoot ?? null, {
      focusPageIndex: progress.page - 1,
      runtimeBase,
    });
  }

  applyMangaResume(root, progress, scrollRoot);
  bindMangaResumeRetries(lazyImages, progress.page - 1, () => {
    applyMangaResume(root, progress, scrollRoot);
  });
}

export function applyPlaybackResume(
  mode: PlaybackMode,
  progress: PlaybackProgress | undefined,
  options: {
    sessionId?: string;
    contentRoot: HTMLElement | null;
    scrollRoot?: HTMLElement | null;
    chapterId?: string;
    runtimeBase?: string | null;
  },
): void {
  if (!progress) return;
  if (mode === "video") {
    if (isProgressTime(progress) && progress.position != null) {
      applyVideoResume(options.sessionId, options.contentRoot, progress.position);
    }
    return;
  }
  if (mode === "audio") {
    if (isProgressTime(progress) && progress.position != null) {
      applyAudioResume(options.contentRoot, progress.position);
    }
    return;
  }
  if (mode === "article" && isProgressArticle(progress)) {
    applyArticleResume(options.contentRoot, progress);
    return;
  }
  if (mode === "manga" && isProgressManga(progress)) {
    const run = () => {
      if (options.contentRoot?.dataset.comicStream === "true") {
        applyMangaStreamResume(
          options.contentRoot,
          progress,
          options.scrollRoot,
          options.chapterId,
          options.runtimeBase,
        );
        return;
      }
      applyMangaFlatPagesResume(
        options.contentRoot,
        progress,
        options.scrollRoot,
        options.runtimeBase,
      );
    };
    scheduleMangaResumeRetries(run);
  }
}

export function applyMangaStreamResume(
  streamRoot: HTMLElement | null,
  progress: ProgressManga,
  scrollRoot?: HTMLElement | null,
  chapterId?: string,
  runtimeBase?: string | null,
): void {
  if (!streamRoot || !progress.page) return;
  const contentRoot = resolveComicStreamChapterContentRoot(streamRoot, chapterId, scrollRoot);
  if (contentRoot) {
    syncComicLazyImagesForChapterPage(streamRoot, contentRoot, progress.page, runtimeBase);
  }
  applyMangaResume(contentRoot, progress, scrollRoot);
  if (contentRoot) {
    const lazyImages = collectComicLazyImages(contentRoot);
    bindMangaResumeRetries(lazyImages, progress.page - 1, () => {
      applyMangaResume(contentRoot, progress, scrollRoot);
    });
  }
}

export async function resolveParentArticleForPlayback(
  record: PlaybackRecord,
  pluginId: string,
  articles: Article[],
): Promise<Article> {
  const cached = articles.find(
    item => item.pluginId === pluginId && item.id === record.parentId,
  );
  if (cached) return cached;
  return fetchFeedItem(record.parentId, {
    pluginId,
    channelId: record.channelId,
  });
}

export function playbackRecordToResumeIntent(record: PlaybackRecord): PlaybackResumeIntent {
  return {
    chapterId: record.chapterId,
    progress: record.progress,
    mode: record.mode,
  };
}

export async function fetchResumeIntentForArticle(
  pluginId: string,
  parentId: string,
  channelId?: string,
): Promise<PlaybackResumeIntent | undefined> {
  try {
    const record = await getPlayback(pluginId, parentId, channelId);
    if (!record?.progress || !hasMeaningfulProgress(record.progress)) {
      return undefined;
    }
    return playbackRecordToResumeIntent(record);
  } catch {
    return undefined;
  }
}
