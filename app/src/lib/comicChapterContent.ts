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

  for (const i of comicLazyLoadOrder(currentIndex, loadStart, loadEnd)) {
    const img = images[i];
    const dataSrc = img.getAttribute("data-src") ?? "";
    if (!dataSrc) continue;
    startComicLazyImageLoad(img, dataSrc, options?.runtimeBase);
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

/** Flatten plugin comic HTML to sequential page images; null when no pages found. */
export function prepareComicFlatPagesHtml(contentHtml: string): string | null {
  if (!contentHtml.trim() || !isComicReaderHtml(contentHtml)) return null;
  const flat = flattenComicChapterImagesHtml(contentHtml);
  if (!flat.trim()) return null;
  if (typeof DOMParser === "undefined") return flat;

  const doc = new DOMParser().parseFromString(flat, "text/html");
  return collectComicPageImageElements(doc.body).length > 0 ? flat : null;
}

/** Flatten to page images when possible; otherwise keep the original HTML. */
export function prepareComicStreamSlotHtml(contentHtml: string): string {
  if (!contentHtml.trim()) return "";
  const flat = prepareComicFlatPagesHtml(contentHtml);
  return flat ?? contentHtml;
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

  let currentIndex = 0;
  for (let i = 0; i < images.length; i++) {
    const rect = images[i].getBoundingClientRect();
    if (rect.top <= focusLine) {
      currentIndex = i;
    }
  }

  return images.length - 1 - currentIndex;
}

