import { prepareArticleHtmlContent } from "@/lib/articleContent";
import {
  bindSingleArticleContentImage,
  comicPageImageUrl,
  isComicLazyImageActivated,
} from "@/lib/imageProxy";
import { isTauriRuntime } from "@/lib/appInfo";
import { getCachedRuntimeBaseUrl } from "@/lib/runtime";
import { isDarkTheme } from "@/lib/themeMode";
import type { Article, ThemeMode } from "@/types";

export const COMIC_PRELOAD_REMAINING_PAGES = 10;

/** Distance from chapter bottom (px) before prefetching the next chapter. */
export const COMIC_CHAPTER_PREFETCH_DISTANCE_PX = 1600;

/** Parse comic chapter content when it is a JSON array of image URLs. */
export function parseComicPageUrls(content: string): string[] | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("[")) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const urls: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") return null;
      const url = item.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
      urls.push(url);
    }
    return urls;
  } catch {
    return null;
  }
}

export function isComicReaderHtml(content: string): boolean {
  return content.includes("comic-reader");
}

export function resolveComicArticleDisplay(
  article: Pick<Article, "content" | "image" | "type">,
  runtimeBase: string | null,
  theme: ThemeMode,
): { pageUrls: string[] | null; html: string } {
  const raw = article.content?.trim() ?? "";
  const pageUrls = parseComicPageUrls(raw);
  if (pageUrls) {
    return { pageUrls, html: "" };
  }

  if (!raw) {
    return { pageUrls: null, html: "" };
  }

  return {
    pageUrls: null,
    html: prepareArticleHtmlContent(raw, runtimeBase, {
      darkTheme: isDarkTheme(theme),
    }),
  };
}

export function resolveComicStreamSlotContent(
  article: Article,
  runtimeBase: string | null,
  theme: ThemeMode,
): { pageUrls: string[] | null; html: string } {
  const resolved = resolveComicArticleDisplay(article, runtimeBase, theme);
  if (resolved.pageUrls?.length || !resolved.html.trim()) {
    return resolved;
  }
  return {
    pageUrls: null,
    html: prepareComicStreamSlotHtml(resolved.html),
  };
}

export function isComicStreamSlotReady(content: {
  pageUrls: string[] | null;
  html: string;
}): boolean {
  return Boolean(content.pageUrls?.length || content.html.trim());
}

export function comicStreamContentSignature(
  article: Article,
  runtimeBase: string | null,
  theme: ThemeMode,
): string {
  const { pageUrls, html } = resolveComicStreamSlotContent(article, runtimeBase, theme);
  if (pageUrls?.length) return pageUrls.join("\n");
  return comicChapterStreamSignature(html);
}

/** 1×1 transparent GIF — keeps layout without triggering network loads. */
export const COMIC_LAZY_PLACEHOLDER_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** How many comic page images to load before/after the current viewport page. */
export const COMIC_LAZY_PRELOAD_BEFORE = 5;
export const COMIC_LAZY_PRELOAD_AFTER = 10;

/** Limit parallel image fetches to reduce CDN 429 rate limits. */
const COMIC_LAZY_MAX_CONCURRENT = 5;

/** Viewport-first order: current page, then ahead (fast scroll), then behind. */
function comicLazyLoadOrder(
  currentIndex: number,
  loadStart: number,
  loadEnd: number,
): number[] {
  const indices: number[] = [];
  if (currentIndex >= loadStart && currentIndex <= loadEnd) {
    indices.push(currentIndex);
  }
  for (let i = currentIndex + 1; i <= loadEnd; i++) {
    indices.push(i);
  }
  for (let i = currentIndex - 1; i >= loadStart; i--) {
    indices.push(i);
  }
  return indices;
}

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

function resolveComicRuntimeBase(
  runtimeBase: string | null | undefined,
): string | null {
  return runtimeBase ?? getCachedRuntimeBaseUrl();
}

function startComicLazyImageLoad(
  img: HTMLImageElement,
  dataSrc: string,
  runtimeBase: string | null | undefined,
): void {
  const base = resolveComicRuntimeBase(runtimeBase);
  if (isTauriRuntime() && !base) return;
  if (isComicLazyImageActivated(img, base) || img.dataset.comicLazyLoading === "true") return;

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
    delete img.dataset.orbitImgRetry;
    const displaySrc = comicPageImageUrl(base, dataSrc);
    bindSingleArticleContentImage(img, base);
    img.src = displaySrc;
  });
}

export function collectComicLazyImages(root: ParentNode): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>("img[data-comic-lazy]"));
}

function resolveComicViewportMetrics(scrollRoot: HTMLElement | null): {
  focusLine: number;
  rootTop: number;
  rootBottom: number;
} {
  if (scrollRoot) {
    const rootRect = scrollRoot.getBoundingClientRect();
    return {
      focusLine: rootRect.top + rootRect.height * 0.4,
      rootTop: rootRect.top,
      rootBottom: rootRect.bottom,
    };
  }
  return {
    focusLine: window.innerHeight * 0.4,
    rootTop: 0,
    rootBottom: window.innerHeight,
  };
}

function isComicImageInViewport(
  rect: DOMRect,
  rootTop: number,
  rootBottom: number,
): boolean {
  return rect.bottom > rootTop && rect.top < rootBottom;
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

  const { focusLine, rootTop, rootBottom } = resolveComicViewportMetrics(scrollRoot);

  let currentIndex = -1;
  let hasInViewport = false;
  for (let i = 0; i < images.length; i++) {
    const rect = images[i].getBoundingClientRect();
    if (rect.height <= 1) continue;
    if (!isComicImageInViewport(rect, rootTop, rootBottom)) {
      if (rect.bottom <= rootTop) {
        currentIndex = i;
      }
      continue;
    }
    hasInViewport = true;
    if (rect.top <= focusLine) {
      currentIndex = i;
    }
  }

  if (!hasInViewport) return -1;
  return Math.max(0, currentIndex);
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
  if (currentIndex < 0) return;
  const loadStart = Math.max(0, currentIndex - COMIC_LAZY_PRELOAD_BEFORE);
  const loadEnd = Math.min(images.length - 1, currentIndex + COMIC_LAZY_PRELOAD_AFTER);

  for (const i of comicLazyLoadOrder(currentIndex, loadStart, loadEnd)) {
    const img = images[i];
    const dataSrc = img.getAttribute("data-src") ?? "";
    if (!dataSrc) continue;
    startComicLazyImageLoad(img, dataSrc, options?.runtimeBase);
  }
}

/** Eagerly load the first N pages of a chapter (for seamless chapter transitions). */
export function syncComicLazyImagesLeading(
  chapterRoot: HTMLElement,
  count: number,
  runtimeBase?: string | null,
): void {
  const images = collectComicLazyImages(chapterRoot);
  if (images.length === 0) return;
  const end = Math.min(Math.max(0, count), images.length);
  for (let i = 0; i < end; i++) {
    const dataSrc = images[i].getAttribute("data-src") ?? "";
    if (!dataSrc) continue;
    startComicLazyImageLoad(images[i], dataSrc, runtimeBase);
  }
}

/** True when the reader has scrolled within `thresholdPx` of a chapter block's end. */
export function isNearComicChapterEnd(
  chapterBlock: HTMLElement,
  scrollRoot: HTMLElement,
  thresholdPx = COMIC_CHAPTER_PREFETCH_DISTANCE_PX,
): boolean {
  const rootRect = scrollRoot.getBoundingClientRect();
  const blockRect = chapterBlock.getBoundingClientRect();
  return blockRect.bottom - rootRect.bottom <= thresholdPx;
}

function findVisibleComicChapterBlockInStream(
  streamRoot: HTMLElement,
  scrollRoot: HTMLElement | null,
): HTMLElement | null {
  const blocks = Array.from(
    streamRoot.querySelectorAll<HTMLElement>("[data-comic-chapter]"),
  );
  if (blocks.length === 0) return null;

  const { focusLine, rootTop, rootBottom } = resolveComicViewportMetrics(scrollRoot);
  let bestBlock: HTMLElement | null = null;
  let bestTop = -Infinity;

  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (!isComicImageInViewport(rect, rootTop, rootBottom)) continue;
    if (rect.top <= focusLine && rect.top > bestTop) {
      bestTop = rect.top;
      bestBlock = block;
    }
  }

  if (bestBlock) return bestBlock;

  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (isComicImageInViewport(rect, rootTop, rootBottom)) {
      return block;
    }
  }

  return null;
}

/** Load page images for the chapter block currently in view (stream mode). */
export function syncComicStreamVisibleChapterImages(
  streamRoot: HTMLElement,
  scrollRoot: HTMLElement | null,
  options?: { runtimeBase?: string | null },
): void {
  const visibleBlock = findVisibleComicChapterBlockInStream(streamRoot, scrollRoot);
  const content = visibleBlock?.querySelector<HTMLElement>(".article-content");
  if (!content) return;
  syncComicLazyImages(content, scrollRoot, options);
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

export function formatComicChapterToolbarSubtitle(options: {
  seriesTitle: string;
  chapterIndex: number;
  chapterLabel?: string;
  chapterTitle?: string | null;
}): string {
  const { seriesTitle, chapterIndex, chapterLabel = "话", chapterTitle } = options;
  const episodePart = `第${chapterIndex + 1}${chapterLabel}`;
  const parts = [seriesTitle, episodePart];

  const trimmedTitle = chapterTitle?.trim();
  if (trimmedTitle && trimmedTitle !== seriesTitle) {
    let shortTitle = trimmedTitle;
    for (const sep of ["·", "・", " - ", " — ", ": ", "："]) {
      const prefix = `${seriesTitle}${sep}`;
      if (trimmedTitle.startsWith(prefix)) {
        shortTitle = trimmedTitle.slice(prefix.length).trim();
        break;
      }
    }
    if (shortTitle && shortTitle !== seriesTitle) {
      parts.push(shortTitle);
    }
  }

  return parts.join(" · ");
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

/** Stable signature for stream chapter content — skip rebuild when URLs are unchanged. */
export function comicChapterStreamSignature(contentHtml: string): string {
  const pages = parseComicPageUrls(contentHtml);
  if (pages) return pages.join("\n");

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
  const base = resolveComicRuntimeBase(runtimeBase);

  if (img.hasAttribute("data-comic-lazy")) {
    startComicLazyImageLoad(img, dataSrc, base);
    return;
  }

  const displaySrc = comicPageImageUrl(base, dataSrc);
  if (img.getAttribute("src")?.trim() === displaySrc) {
    bindSingleArticleContentImage(img, base);
    return;
  }

  bindSingleArticleContentImage(img, base);
  img.src = displaySrc;
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

  for (const i of comicLazyLoadOrder(currentIndex, loadStart, loadEnd)) {
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
  if (parseComicPageUrls(article.content)) return "";
  return prepareArticleHtmlContent(article.content, runtimeBase, {
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

/** Flatten plugin comic HTML to sequential page images; null when no pages found. */
export function prepareComicFlatPagesHtml(contentHtml: string): string | null {
  if (parseComicPageUrls(contentHtml)) return null;
  if (!contentHtml.trim() || !isComicReaderHtml(contentHtml)) return null;
  const flat = flattenComicChapterImagesHtml(contentHtml);
  if (!flat.trim()) return null;
  if (typeof DOMParser === "undefined") return flat;

  const doc = new DOMParser().parseFromString(flat, "text/html");
  return collectComicPageImageElements(doc.body).length > 0 ? flat : null;
}

/** Keep plugin HTML as-is for stream slots (no flattening). */
export function prepareComicStreamSlotHtml(contentHtml: string): string {
  const trimmed = contentHtml.trim();
  if (!trimmed || typeof DOMParser === "undefined") {
    return trimmed;
  }

  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  const body = doc.body;

  const hasComicPages = collectComicPageImageElements(body).length > 0;
  if (!hasComicPages) {
    return trimmed;
  }

  // Some plugin chapters inject a sticky "简介" card before pages.
  // In stream mode this card can persist across chapter boundaries.
  let removed = false;
  for (const detailBody of body.querySelectorAll<HTMLElement>(".comic-detail-body")) {
    const text = (detailBody.textContent ?? "").replace(/\s+/g, "");
    if (!text) continue;
    const looksLikeIntro = /来源|打开原网页|简介|介绍/.test(text);
    if (!looksLikeIntro) continue;

    const removableRoot = detailBody.closest(".comic-detail") ?? detailBody;
    removableRoot.remove();
    removed = true;
  }

  return removed ? body.innerHTML.trim() : trimmed;
}

const MANGA_INTRO_NAV_RE = /^(简介|介绍|章节|目录|推荐|评论|相关|资讯|话|卷)/;
const MANGA_INTRO_META_RE = /来源|打开原网页|原作者|更新时间|连载/;
const MANGA_INTRO_TAG_RE = /#\S|标签|分类|类型|题材/;

function isMangaIntroCandidate(html: string): boolean {
  if (!html.trim() || html.includes("comic-reader") || html.includes("manga-intro")) {
    return false;
  }
  return /<img[\s>]/i.test(html) && /简介|介绍|来源/.test(html);
}

function stripInlineStyles(el: HTMLElement): void {
  el.removeAttribute("style");
  el.removeAttribute("bgcolor");
  el.removeAttribute("color");
  if (el.tagName === "FONT") {
    const span = el.ownerDocument.createElement("span");
    span.innerHTML = el.innerHTML;
    el.replaceWith(span);
  }
}

function classifyMangaIntroBlock(el: HTMLElement): string {
  const text = (el.textContent ?? "").trim();
  if (!text) return "manga-intro__misc";

  if (MANGA_INTRO_META_RE.test(text) && text.length < 140) {
    return "manga-intro__meta";
  }
  if (el.tagName === "H1" || el.tagName === "H2" || el.tagName === "H3") {
    return "manga-intro__title";
  }
  if (MANGA_INTRO_TAG_RE.test(text) && text.length < 240) {
    return "manga-intro__tags";
  }
  if (el.tagName === "UL" || el.tagName === "OL") {
    return "manga-intro__nav";
  }

  const shortChildren = Array.from(el.children).filter(
    child => (child.textContent?.trim().length ?? 0) > 0
      && (child.textContent?.trim().length ?? 0) < 24,
  );
  if (shortChildren.length >= 2 && text.length < 120) {
    return "manga-intro__nav";
  }
  if (MANGA_INTRO_NAV_RE.test(text) && text.length < 80) {
    return "manga-intro__nav";
  }
  if (text.length >= 36 || el.tagName === "P" || el.tagName === "BLOCKQUOTE") {
    return "manga-intro__synopsis";
  }
  return "manga-intro__misc";
}

function collectMangaIntroRoots(body: HTMLElement): HTMLElement[] {
  const children = Array.from(body.children).filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  if (children.length === 1) {
    const only = children[0];
    const nested = Array.from(only.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
    if (nested.length > 1 && !only.classList.contains("manga-intro")) {
      return nested;
    }
  }
  return children;
}

function extractMangaIntroCover(
  roots: HTMLElement[],
  doc: Document,
): { hero: HTMLElement | null; remaining: HTMLElement[] } {
  const remaining = [...roots];
  let hero: HTMLElement | null = null;

  for (let i = 0; i < remaining.length; i++) {
    const root = remaining[i];
    const img = root.tagName === "IMG"
      ? root
      : root.querySelector("img");
    if (!(img instanceof HTMLImageElement)) continue;

    const src = resolveComicImageUrl(img);
    if (!src || src.startsWith("data:")) continue;

    hero = doc.createElement("div");
    hero.className = "manga-intro__hero-aside";
    img.classList.add("manga-intro__cover");
    stripInlineStyles(img);

    if (root.tagName === "IMG") {
      hero.appendChild(img);
      remaining.splice(i, 1);
    } else if (root.childElementCount === 1 && root.querySelector("img") === img) {
      hero.appendChild(img);
      remaining.splice(i, 1);
    } else {
      img.remove();
      hero.appendChild(img);
    }
    break;
  }

  return { hero, remaining };
}

/** Restructure plugin manga synopsis HTML for reader styling. */
export function normalizeMangaIntroHtml(html: string): string {
  if (!isMangaIntroCandidate(html) || typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (body.querySelector(".manga-intro")) return html;

  const roots = collectMangaIntroRoots(body);
  if (roots.length === 0) return html;

  const { hero, remaining } = extractMangaIntroCover(roots, doc);
  const headerBlocks: HTMLElement[] = [];
  const navBlocks: HTMLElement[] = [];
  const synopsisBlocks: HTMLElement[] = [];
  const miscBlocks: HTMLElement[] = [];

  for (const root of remaining) {
    stripInlineStyles(root);
    const kind = classifyMangaIntroBlock(root);
    root.classList.add(kind);
    if (kind === "manga-intro__title" || kind === "manga-intro__tags" || kind === "manga-intro__meta") {
      headerBlocks.push(root);
    } else if (kind === "manga-intro__nav") {
      navBlocks.push(root);
    } else if (kind === "manga-intro__synopsis") {
      synopsisBlocks.push(root);
    } else {
      miscBlocks.push(root);
    }
  }

  const wrapper = doc.createElement("div");
  wrapper.className = "manga-intro";

  if (hero || headerBlocks.length > 0) {
    const header = doc.createElement("div");
    header.className = "manga-intro__header";
    if (hero) header.appendChild(hero);

    if (headerBlocks.length > 0) {
      const headerBody = doc.createElement("div");
      headerBody.className = "manga-intro__header-body";
      for (const block of headerBlocks) {
        headerBody.appendChild(block);
      }
      header.appendChild(headerBody);
    }
    wrapper.appendChild(header);
  }

  for (const block of navBlocks) {
    wrapper.appendChild(block);
  }

  if (synopsisBlocks.length > 0) {
    const card = doc.createElement("div");
    card.className = "manga-intro__synopsis-card";
    const label = doc.createElement("h3");
    label.className = "manga-intro__section-label";
    label.textContent = "简介";
    card.appendChild(label);
    for (const block of synopsisBlocks) {
      card.appendChild(block);
    }
    wrapper.appendChild(card);
  }

  for (const block of miscBlocks) {
    wrapper.appendChild(block);
  }

  body.replaceChildren(wrapper);
  return body.innerHTML;
}

export function prepareMangaIntroDisplayContent(html: string): string {
  return normalizeMangaIntroHtml(html);
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

  let currentIndex = -1;
  for (let i = 0; i < images.length; i++) {
    const rect = images[i].getBoundingClientRect();
    if (rect.height <= 1) continue;
    if (rect.bottom <= rootRect.top) {
      currentIndex = i;
      continue;
    }
    if (rect.top >= rootRect.bottom) break;
    if (rect.top <= focusLine) {
      currentIndex = i;
    }
  }

  if (currentIndex < 0) return images.length - 1;
  return images.length - 1 - currentIndex;
}

