import {
  bindArticleContentImages,
  displayImageUrl,
  isComicLazyImagePending,
  isHttpImageUrl,
  resolveArticleContentImageUrl,
} from "@/lib/imageProxy";

const PREVIEW_BOUND_ATTR = "data-orbit-preview-bound";

/** Image preview is for HTML article bodies only — not comic/manga readers. */
export function shouldEnableArticleImagePreview(options: {
  isComicReaderContent: boolean;
  comicChapterStreamActive?: boolean;
  pluginMediaType?: string;
}): boolean {
  if (options.isComicReaderContent) return false;
  if (options.comicChapterStreamActive) return false;
  if (options.pluginMediaType === "manga") return false;
  return true;
}

function isPreviewableArticleImage(
  img: HTMLImageElement,
  runtimeBase: string | null | undefined,
): boolean {
  if (isComicLazyImagePending(img, runtimeBase)) return false;
  if (img.closest(
    ".orbit-content-video-shell, button, .comic-chapter-pages, .comic-chapter-stream, .comic-reader-pages, .article-reader--comic",
  )) {
    return false;
  }
  if (img.hasAttribute("data-comic-lazy")) return false;

  const url = resolveArticleContentImageUrl(img);
  if (!isHttpImageUrl(url)) return false;

  const src = img.getAttribute("src")?.trim() ?? "";
  if (src.startsWith("data:") && !img.getAttribute("data-src")?.trim()) {
    return false;
  }

  return true;
}

export function collectArticleContentImageUrls(
  root: HTMLElement,
  runtimeBase: string | null | undefined,
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const img of root.querySelectorAll("img")) {
    if (!isPreviewableArticleImage(img, runtimeBase)) continue;
    const url = resolveArticleContentImageUrl(img);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  return urls;
}

function imageFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").pop()?.trim() ?? "";
    if (base) return base;
  } catch {
    // fall through
  }
  const fallback = url.split("/").pop()?.split("?")[0]?.trim() ?? "";
  return fallback || "image";
}

export async function downloadArticleContentImage(
  url: string,
  runtimeBase: string | null | undefined,
): Promise<void> {
  const trimmed = url.trim();
  if (!isHttpImageUrl(trimmed)) return;

  const fetchUrl = displayImageUrl(runtimeBase, trimmed) || trimmed;
  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`download failed: ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = imageFilenameFromUrl(trimmed);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function bindArticleContentImagePreview(
  root: HTMLElement,
  options: {
    runtimeBase: string | null | undefined;
    onOpen: (urls: string[], index: number) => void;
  },
): () => void {
  const controller = new AbortController();
  const { signal } = controller;

  const refreshPreviewableMarks = () => {
    for (const img of root.querySelectorAll("img")) {
      const previewable = isPreviewableArticleImage(img, options.runtimeBase);
      img.classList.toggle("orbit-article-image-previewable", previewable);
      if (previewable) {
        img.setAttribute(PREVIEW_BOUND_ATTR, "true");
      } else {
        img.removeAttribute(PREVIEW_BOUND_ATTR);
      }
    }
  };

  refreshPreviewableMarks();

  const handleClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    if (!isPreviewableArticleImage(target, options.runtimeBase)) return;

    event.preventDefault();
    event.stopPropagation();

    const urls = collectArticleContentImageUrls(root, options.runtimeBase);
    const clickedUrl = resolveArticleContentImageUrl(target);
    const index = urls.findIndex(url => url === clickedUrl);
    options.onOpen(urls, index >= 0 ? index : 0);
  };

  root.addEventListener("click", handleClick, { signal });

  return () => controller.abort();
}

export function bindArticleContentImagesWithPreview(
  root: HTMLElement | null,
  runtimeBase: string | null | undefined,
  options?: {
    onImagePreview?: (urls: string[], index: number) => void;
    previewEnabled?: boolean;
  },
): () => void {
  if (!root) return () => {};

  bindArticleContentImages(root, runtimeBase);
  if (!options?.onImagePreview || options.previewEnabled === false) return () => {};

  return bindArticleContentImagePreview(root, {
    runtimeBase,
    onOpen: options.onImagePreview,
  });
}
