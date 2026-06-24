import {
  dedupeCoverImageFromContent,
  prepareArticleHtmlContent,
} from "@/lib/articleContent";
import { bindSingleArticleContentImage } from "@/lib/imageProxy";
import { isDarkTheme } from "@/lib/themeMode";
import type { Article, ThemeMode } from "@/types";

export const COMIC_PRELOAD_REMAINING_PAGES = 10;

/** 1×1 transparent GIF — keeps layout without triggering network loads. */
export const COMIC_LAZY_PLACEHOLDER_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** How many comic page images to load before/after the current viewport page. */
export const COMIC_LAZY_PRELOAD_BEFORE = 5;
export const COMIC_LAZY_PRELOAD_AFTER = 5;

/** Limit parallel image fetches to reduce CDN 429 rate limits. */
const COMIC_LAZY_MAX_CONCURRENT = 3;

let comicLazyInflight = 0;
const comicLazyWaiters: Array<() => void> = [];

function acquireComicLazySlot(): Promise<void> {
  if (comicLazyInflight < COMIC_LAZY_MAX_CONCURRENT) {
    comicLazyInflight += 1;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    comicLazyWaiters.push(() => {
      comicLazyInflight += 1;
      resolve();
    });
  });
}

function releaseComicLazySlot(): void {
  comicLazyInflight = Math.max(0, comicLazyInflight - 1);
  const next = comicLazyWaiters.shift();
  next?.();
}

function resolveComicImageUrl(img: Element): string {
  for (const attr of ["data-src", "data-original", "data-lazy-src", "src"]) {
    const value = img.getAttribute(attr)?.trim() ?? "";
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return value;
    }
  }
  return "";
}

function isComicLazyImageActivated(img: HTMLImageElement): boolean {
  const dataSrc = img.getAttribute("data-src")?.trim() ?? "";
  if (!dataSrc) return true;
  return img.getAttribute("src")?.trim() === dataSrc;
}

function startComicLazyImageLoad(
  img: HTMLImageElement,
  dataSrc: string,
  runtimeBase: string | null | undefined,
): void {
  if (isComicLazyImageActivated(img) || img.dataset.comicLazyLoading === "true") return;

  img.dataset.comicLazyLoading = "true";
  void acquireComicLazySlot().then(() => {
    if (!img.isConnected || img.getAttribute("data-src") !== dataSrc) {
      releaseComicLazySlot();
      delete img.dataset.comicLazyLoading;
      return;
    }

    const done = () => {
      releaseComicLazySlot();
      delete img.dataset.comicLazyLoading;
    };
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
    img.src = dataSrc;
    bindSingleArticleContentImage(img, runtimeBase);
  });
}

export function collectComicLazyImages(root: ParentNode): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>("img[data-comic-lazy]"));
}

/** 0-based index of the comic page nearest the viewport focus line. */
export function resolveComicLazyPageIndex(
  images: HTMLImageElement[],
  scrollRoot: HTMLElement | null,
  focusPageIndex?: number,
): number {
  if (focusPageIndex != null && focusPageIndex >= 0 && focusPageIndex < images.length) {
    return focusPageIndex;
  }
  if (images.length === 0) return 0;

  const rootRect = scrollRoot?.getBoundingClientRect();
  const focusLine = rootRect
    ? rootRect.top + rootRect.height * 0.4
    : window.innerHeight * 0.4;

  let currentIndex = 0;
  for (let i = 0; i < images.length; i++) {
    const rect = images[i].getBoundingClientRect();
    if (rect.top <= focusLine) {
      currentIndex = i;
    }
  }
  return currentIndex;
}

/** Load comic page images near the viewport (or a resume target) and skip the rest. */
export function syncComicLazyImages(
  streamRoot: HTMLElement,
  scrollRoot: HTMLElement | null,
  options?: { focusPageIndex?: number; runtimeBase?: string | null },
): void {
  const images = collectComicLazyImages(streamRoot);
  if (images.length === 0) return;

  const currentIndex = resolveComicLazyPageIndex(
    images,
    scrollRoot,
    options?.focusPageIndex,
  );
  const loadStart = Math.max(0, currentIndex - COMIC_LAZY_PRELOAD_BEFORE);
  const loadEnd = Math.min(images.length - 1, currentIndex + COMIC_LAZY_PRELOAD_AFTER);

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const dataSrc = img.getAttribute("data-src") ?? "";
    if (!dataSrc) continue;

    if (i >= loadStart && i <= loadEnd) {
      startComicLazyImageLoad(img, dataSrc, options?.runtimeBase);
    }
  }
}

export function syncComicLazyImagesForChapterPage(
  streamRoot: HTMLElement,
  chapterContentRoot: HTMLElement,
  page: number,
  runtimeBase?: string | null,
): void {
  const allImages = collectComicLazyImages(streamRoot);
  const chapterImages = collectComicLazyImages(chapterContentRoot);
  const focusImg = chapterImages[page - 1];
  if (!focusImg) return;
  const focusIndex = allImages.indexOf(focusImg);
  if (focusIndex < 0) return;
  syncComicLazyImages(streamRoot, null, { focusPageIndex: focusIndex, runtimeBase });
}

export function isComicReaderHtml(html: string): boolean {
  return html.includes("comic-reader");
}

const COMIC_PAGE_IMAGE_SELECTOR = [
  ".comic-reader-pages img",
  "figure[id^='comic-page'] img",
  ".comic-reader-page figure img",
].join(", ");

const COMIC_NAV_IMAGE_SELECTOR = [
  "nav img",
  ".comic-reader-nav img",
  ".comic-reader-controls img",
  "button img",
].join(", ");

function isComicNavImage(img: Element): boolean {
  return Boolean(img.closest("nav, .comic-reader-nav, .comic-reader-controls, button"));
}

/** Collect manga page images, excluding prev/next nav thumbnails. */
export function collectComicPageImageElements(reader: ParentNode): HTMLImageElement[] {
  const scoped = Array.from(
    reader.querySelectorAll<HTMLImageElement>(COMIC_PAGE_IMAGE_SELECTOR),
  );
  if (scoped.length > 0) {
    return scoped.filter(img => !isComicNavImage(img));
  }

  return Array.from(reader.querySelectorAll<HTMLImageElement>("img")).filter(
    img => !isComicNavImage(img),
  );
}

/** Stable signature for flattened stream HTML — skip DOM rebuild when URLs are unchanged. */
export function comicChapterStreamSignature(contentHtml: string): string {
  if (!contentHtml.trim() || typeof DOMParser === "undefined") {
    return contentHtml.trim();
  }

  const doc = new DOMParser().parseFromString(contentHtml, "text/html");
  const urls = collectComicPageImageElements(doc.body)
    .map(img => img.getAttribute("data-src") ?? resolveComicImageUrl(img))
    .filter(Boolean);
  return urls.join("\n");
}

function activateComicImage(
  img: HTMLImageElement,
  dataSrc: string,
  runtimeBase: string | null | undefined,
): void {
  if (!dataSrc) return;

  if (img.hasAttribute("data-comic-lazy")) {
    startComicLazyImageLoad(img, dataSrc, runtimeBase);
    return;
  }

  if (img.getAttribute("src")?.trim() === dataSrc) {
    bindSingleArticleContentImage(img, runtimeBase);
    return;
  }

  img.src = dataSrc;
  bindSingleArticleContentImage(img, runtimeBase);
}

/** Eagerly load prev/next nav thumbnails; lazy-load page images near the viewport. */
export function syncComicReaderImages(
  root: HTMLElement,
  scrollRoot: HTMLElement | null,
  options?: { runtimeBase?: string | null },
): void {
  for (const img of root.querySelectorAll<HTMLImageElement>(COMIC_NAV_IMAGE_SELECTOR)) {
    if (!img.closest(".comic-reader, .article-content")) continue;
    const dataSrc = resolveComicImageUrl(img);
    if (dataSrc) {
      activateComicImage(img, dataSrc, options?.runtimeBase);
    }
  }

  const lazyImages = collectComicLazyImages(root);
  if (lazyImages.length > 0) {
    syncComicLazyImages(root, scrollRoot, options);
    return;
  }

  const pageImages = collectComicPageImageElements(root);
  if (pageImages.length === 0) return;

  const currentIndex = resolveComicLazyPageIndex(pageImages, scrollRoot);
  const loadStart = Math.max(0, currentIndex - COMIC_LAZY_PRELOAD_BEFORE);
  const loadEnd = Math.min(pageImages.length - 1, currentIndex + COMIC_LAZY_PRELOAD_AFTER);

  for (let i = 0; i < pageImages.length; i++) {
    if (i < loadStart || i > loadEnd) continue;
    const img = pageImages[i];
    const dataSrc = resolveComicImageUrl(img);
    if (dataSrc) {
      activateComicImage(img, dataSrc, options?.runtimeBase);
    }
  }
}

export function prepareChapterDisplayContent(
  article: Article,
  runtimeBase: string | null,
  theme: ThemeMode,
): string {
  if (!article.content?.trim()) return "";
  let content = article.content;
  if (article.type === "text" && article.image) {
    content = dedupeCoverImageFromContent(article.image, content);
  }
  return prepareArticleHtmlContent(content, runtimeBase, {
    darkTheme: isDarkTheme(theme),
  });
}

/** Flatten chapter HTML to sequential page images for seamless vertical stitching. */
export function flattenComicChapterImagesHtml(contentHtml: string): string {
  if (!contentHtml.trim() || typeof DOMParser === "undefined") {
    return contentHtml;
  }

  const doc = new DOMParser().parseFromString(contentHtml, "text/html");
  const reader = doc.body.querySelector(".comic-reader") ?? doc.body;
  const images = collectComicPageImageElements(reader);
  if (images.length === 0) return contentHtml;

  return images
    .map(img => {
      const src = resolveComicImageUrl(img);
      for (const attr of ["data-src", "data-original", "data-lazy-src"]) {
        img.removeAttribute(attr);
      }
      if (src) {
        img.setAttribute("data-src", src);
      }
      img.setAttribute("src", COMIC_LAZY_PLACEHOLDER_SRC);
      img.setAttribute("data-comic-lazy", "true");
      img.setAttribute("referrerpolicy", "no-referrer");
      img.classList.add("comic-page-lazy");
      return img.outerHTML;
    })
    .join("");
}

export function countMangaRemainingPages(
  contentRoot: HTMLElement,
  scrollRoot: HTMLElement,
): number | null {
  const images = collectComicLazyImages(contentRoot);
  if (images.length === 0) {
    const fallback = collectComicPageImageElements(contentRoot);
    if (fallback.length === 0) return null;
    return countMangaRemainingPagesFromImages(fallback, scrollRoot);
  }
  return countMangaRemainingPagesFromImages(images, scrollRoot);
}

function countMangaRemainingPagesFromImages(
  images: HTMLImageElement[],
  scrollRoot: HTMLElement,
): number {

  const rootRect = scrollRoot.getBoundingClientRect();
  const focusLine = rootRect.top + rootRect.height * 0.55;

  let currentIndex = 0;
  for (let i = 0; i < images.length; i++) {
    const rect = images[i].getBoundingClientRect();
    if (rect.top <= focusLine) {
      currentIndex = i;
    }
  }

  return images.length - 1 - currentIndex;
}

