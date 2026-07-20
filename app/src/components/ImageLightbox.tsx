import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "@/components/Icon";
import { ProxiedImage } from "@/components/ProxiedImage";
import { prepareArticleHtmlContent } from "@/lib/articleContent";
import { downloadArticleContentImage } from "@/lib/articleContentImagePreview";

export interface GalleryImageItem {
  id: string;
  url: string;
  title: string;
  author?: string;
  content?: string;
  summary?: string;
  sourceUrl?: string;
}

export type GalleryImageItemDetail = Pick<GalleryImageItem, "content" | "summary" | "sourceUrl">;

const PROMPT_SECTION_LABEL_PATTERN = /^(英文提示词|中文提示词|正向提示词|反向提示词|negative prompt|positive prompt)$/i;
const PROMPT_META_LINE_PATTERN = /^模型[：:]/;

function contentToPlainText(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  if (typeof DOMParser === "undefined") {
    return trimmed.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  const blockSelector = "p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre, tr";
  doc.body.querySelectorAll(blockSelector).forEach(element => {
    element.prepend(doc.createTextNode("\n"));
    element.append(doc.createTextNode("\n"));
  });
  doc.body.querySelectorAll("br").forEach(element => {
    element.replaceWith(doc.createTextNode("\n"));
  });

  return (doc.body.textContent ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function enhancePromptContentHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed || typeof DOMParser === "undefined") {
    return html;
  }

  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  let changed = false;

  doc.body.querySelectorAll("p, div, h3, h4, h5, h6, strong, b").forEach(element => {
    const text = (element.textContent ?? "").trim();
    if (!text) return;

    if (PROMPT_SECTION_LABEL_PATTERN.test(text)) {
      element.classList.add("image-lightbox-prompt-label");
      changed = true;
      return;
    }

    if (PROMPT_META_LINE_PATTERN.test(text)) {
      element.classList.add("image-lightbox-prompt-meta");
      changed = true;
    }
  });

  return changed ? doc.body.innerHTML : html;
}

interface ImageLightboxProps {
  runtimeBase: string | null;
  images: GalleryImageItem[];
  currentIndex: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onNearEnd?: () => void;
  onResolveDetail?: (item: GalleryImageItem) => Promise<GalleryImageItemDetail>;
}

const DEFAULT_CONTENT_PANEL_WIDTH = 320;
const MIN_CONTENT_PANEL_WIDTH = 200;
const MAX_CONTENT_PANEL_WIDTH = 720;

function clampContentPanelWidth(width: number, containerWidth: number): number {
  const maxWidth = Math.min(MAX_CONTENT_PANEL_WIDTH, Math.max(MIN_CONTENT_PANEL_WIDTH, containerWidth * 0.75));
  return Math.min(maxWidth, Math.max(MIN_CONTENT_PANEL_WIDTH, width));
}

export function ImageLightbox({
  runtimeBase,
  images,
  currentIndex,
  onClose,
  onIndexChange,
  onNearEnd,
  onResolveDetail,
}: ImageLightboxProps) {
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const contentCopyResetTimerRef = useRef<number | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [contentCopied, setContentCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resolvedDetails, setResolvedDetails] = useState<Record<string, GalleryImageItemDetail>>({});
  const [contentPanelWidth, setContentPanelWidth] = useState(DEFAULT_CONTENT_PANEL_WIDTH);
  const current = images[currentIndex];
  const resolvedDetail = current ? resolvedDetails[current.id] : undefined;
  const effectiveContent = resolvedDetail?.content ?? current?.content;
  const effectiveSummary = (resolvedDetail?.summary ?? current?.summary ?? "").trim();
  const effectiveSourceUrl = resolvedDetail?.sourceUrl ?? current?.sourceUrl;
  const plainContent = useMemo(
    () => contentToPlainText(effectiveContent ?? ""),
    [effectiveContent],
  );
  const displayContentHtml = useMemo(() => {
    const raw = effectiveContent?.trim();
    if (!raw) return "";
    return enhancePromptContentHtml(
      prepareArticleHtmlContent(raw, runtimeBase, { darkTheme: true }),
    );
  }, [effectiveContent, runtimeBase]);
  const hasResolvableDetail = Boolean(
    plainContent || effectiveSummary || onResolveDetail,
  );

  const copyImageUrl = useCallback(async () => {
    const url = current?.url?.trim();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setUrlCopied(false);
        copyResetTimerRef.current = null;
      }, 1500);
    } catch {
      // ignore clipboard errors
    }
  }, [current?.url]);

  const copyContent = useCallback(async () => {
    const text = plainContent || effectiveSummary;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setContentCopied(true);
      if (contentCopyResetTimerRef.current !== null) {
        window.clearTimeout(contentCopyResetTimerRef.current);
      }
      contentCopyResetTimerRef.current = window.setTimeout(() => {
        setContentCopied(false);
        contentCopyResetTimerRef.current = null;
      }, 1500);
    } catch {
      // ignore clipboard errors
    }
  }, [plainContent, effectiveSummary]);

  const loadDetailIfNeeded = useCallback(async (item: GalleryImageItem) => {
    if (!onResolveDetail) return;
    if (resolvedDetails[item.id]) return;
    const hasLocalContent = Boolean(contentToPlainText(item.content ?? "") || item.summary?.trim());
    if (hasLocalContent) return;

    setDetailLoading(true);
    try {
      const detail = await onResolveDetail(item);
      setResolvedDetails(prev => ({ ...prev, [item.id]: detail }));
    } catch {
      // ignore detail fetch errors
    } finally {
      setDetailLoading(false);
    }
  }, [onResolveDetail, resolvedDetails]);

  const toggleContentPanel = useCallback(() => {
    setShowContent(prev => {
      const next = !prev;
      if (next && current) {
        void loadDetailIfNeeded(current);
      }
      return next;
    });
  }, [current, loadDetailIfNeeded]);

  const downloadImage = useCallback(async () => {
    const url = current?.url?.trim();
    if (!url || downloading) return;
    setDownloading(true);
    try {
      await downloadArticleContentImage(url, runtimeBase);
    } catch {
      // ignore download errors
    } finally {
      setDownloading(false);
    }
  }, [current?.url, downloading, runtimeBase]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      if (contentCopyResetTimerRef.current !== null) {
        window.clearTimeout(contentCopyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setUrlCopied(false);
    setContentCopied(false);
    setDetailLoading(false);
  }, [currentIndex]);

  useEffect(() => {
    if (!showContent || !current) return;
    void loadDetailIfNeeded(current);
  }, [showContent, current, loadDetailIfNeeded]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    }
  }, [currentIndex, onIndexChange]);

  const goNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      onIndexChange(currentIndex + 1);
    }
    if (currentIndex >= images.length - 3) {
      onNearEnd?.();
    }
  }, [currentIndex, images.length, onIndexChange, onNearEnd]);

  const handleContentDividerPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = mainAreaRef.current;
    if (!container) return;

    const containerWidth = container.getBoundingClientRect().width;
    const startX = event.clientX;
    const startWidth = contentPanelWidth;

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setContentPanelWidth(clampContentPanelWidth(startWidth - delta, containerWidth));
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, [contentPanelWidth]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key === "ArrowRight") {
        goNext();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goPrev, goNext]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const active = strip.children[currentIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentIndex]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
    >
      <div className="relative z-20 flex shrink-0 items-center justify-between border-b border-white/10 bg-black/95 px-4 py-3">
        <div className="min-w-0 flex-1 pr-4">
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <p className="text-sm font-medium text-white truncate min-w-0">
              {current.title}
            </p>
            <button
              type="button"
              onClick={() => void copyImageUrl()}
              className="shrink-0 p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              title={urlCopied ? "已复制" : "复制图片地址"}
              aria-label={urlCopied ? "已复制图片地址" : "复制图片地址"}
            >
              {urlCopied ? (
                <Icon name="check" className="w-4 h-4" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                  aria-hidden
                >
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => void downloadImage()}
              disabled={downloading}
              className="shrink-0 p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              title="下载图片"
              aria-label="下载图片"
            >
              <Icon
                name="download"
                className={`w-4 h-4${downloading ? " animate-pulse" : ""}`}
              />
            </button>
            {hasResolvableDetail ? (
              <button
                type="button"
                onClick={toggleContentPanel}
                className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                  showContent
                    ? "text-white bg-white/15"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
                title={showContent ? "隐藏内容" : "查看内容"}
                aria-label={showContent ? "隐藏内容" : "查看内容"}
                aria-pressed={showContent}
              >
                <Icon name="info" className="w-4 h-4" />
              </button>
            ) : null}
          </div>
          {current.author ? (
            <p className="text-xs text-white/50 truncate mt-0.5">{current.author}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-white/60 tabular-nums">
            {currentIndex + 1} / {images.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="关闭预览"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        ref={mainAreaRef}
        className={`relative z-0 flex min-h-0 min-w-0 flex-1 overflow-hidden ${
          showContent ? "flex-row px-4 sm:px-6" : "px-12"
        }`}
      >
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
          <button
            type="button"
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="absolute left-0 sm:left-2 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 disabled:opacity-20 disabled:pointer-events-none transition-all"
            aria-label="上一张"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>

          <ProxiedImage
            key={current.id}
            runtimeBase={runtimeBase}
            src={current.url}
            alt={current.title}
            className="max-h-[calc(100vh-8.5rem)] max-w-full object-contain select-none"
            draggable={false}
          />

          <button
            type="button"
            onClick={goNext}
            disabled={currentIndex === images.length - 1}
            className="absolute right-0 sm:right-2 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 disabled:opacity-20 disabled:pointer-events-none transition-all"
            aria-label="下一张"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>

        {showContent ? (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="调整内容面板宽度"
              onPointerDown={handleContentDividerPointerDown}
              className="orbit-split-divider group relative z-10 w-2 shrink-0 cursor-col-resize touch-none"
            >
              <div className="orbit-split-divider-handle absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2" />
            </div>
            <aside
              className="h-full min-h-0 shrink-0 overflow-y-auto border-l border-white/10 pl-4 pr-1 select-text"
              style={{ width: contentPanelWidth }}
              aria-label="图片内容"
            >
              {detailLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-white/50">
                  <span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
                  正在加载内容…
                </div>
              ) : displayContentHtml || plainContent ? (
                <>
                  {displayContentHtml ? (
                    <div
                      className="image-lightbox-content article-content text-sm select-text"
                      data-theme="dark"
                      dangerouslySetInnerHTML={{ __html: displayContentHtml }}
                    />
                  ) : (
                    <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap break-words select-text">
                      {plainContent}
                    </p>
                  )}
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void copyContent()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                      title={contentCopied ? "已复制" : "复制文字"}
                      aria-label={contentCopied ? "已复制文字" : "复制文字"}
                    >
                      {contentCopied ? (
                        <Icon name="check" className="w-3.5 h-3.5" />
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-3.5 h-3.5"
                          aria-hidden
                        >
                          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </svg>
                      )}
                      {contentCopied ? "已复制" : "复制"}
                    </button>
                  </div>
                </>
              ) : effectiveSummary ? (
                <>
                  <p className="text-sm text-white/70 leading-relaxed italic whitespace-pre-wrap break-words select-text">
                    “ {effectiveSummary} ”
                  </p>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void copyContent()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                      title={contentCopied ? "已复制" : "复制文字"}
                      aria-label={contentCopied ? "已复制文字" : "复制文字"}
                    >
                      {contentCopied ? (
                        <Icon name="check" className="w-3.5 h-3.5" />
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-3.5 h-3.5"
                          aria-hidden
                        >
                          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </svg>
                      )}
                      {contentCopied ? "已复制" : "复制"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-white/40 select-text">暂无内容</p>
              )}
              {effectiveSourceUrl ? (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <a
                    href={effectiveSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200 hover:underline"
                  >
                    阅读原文 →
                  </a>
                </div>
              ) : null}
            </aside>
          </>
        ) : null}
      </div>

      <div
        ref={thumbStripRef}
        className="relative z-20 shrink-0 border-t border-white/10 bg-black/95 px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar"
      >
        {images.map((img, idx) => (
          <button
            key={img.id}
            type="button"
            onClick={() => onIndexChange(idx)}
            className={`shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${
              idx === currentIndex
                ? "border-white scale-105 opacity-100"
                : "border-transparent opacity-50 hover:opacity-80"
            }`}
          >
            <ProxiedImage runtimeBase={runtimeBase} src={img.url} alt="" className="w-full h-full object-cover" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}
