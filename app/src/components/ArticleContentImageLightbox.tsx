import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { ProxiedImage } from "@/components/ProxiedImage";
import { downloadArticleContentImage } from "@/lib/articleContentImagePreview";

interface ArticleContentImageLightboxProps {
  runtimeBase: string | null;
  urls: string[];
  initialIndex: number;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function distanceBetweenTouches(
  touches: { clientX: number; clientY: number }[],
): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

export function ArticleContentImageLightbox({
  runtimeBase,
  urls,
  initialIndex,
  onClose,
}: ArticleContentImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [urlCopied, setUrlCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const copyResetTimerRef = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });
  const pinchRef = useRef({
    active: false,
    startDistance: 0,
    startScale: 1,
    startTranslateX: 0,
    startTranslateY: 0,
    centerX: 0,
    centerY: 0,
  });

  const currentUrl = urls[currentIndex] ?? "";
  const hasMultiple = urls.length > 1;

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const applyZoomAtPoint = useCallback((nextScale: number, clientX: number, clientY: number) => {
    const clamped = clampScale(nextScale);
    if (clamped === 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
      return;
    }

    setScale(prevScale => {
      const viewport = viewportRef.current;
      if (!viewport) return clamped;

      const rect = viewport.getBoundingClientRect();
      const focalX = clientX - rect.left - rect.width / 2;
      const focalY = clientY - rect.top - rect.height / 2;
      const ratio = clamped / prevScale;

      setTranslate(prev => ({
        x: focalX - ratio * (focalX - prev.x),
        y: focalY - ratio * (focalY - prev.y),
      }));
      return clamped;
    });
  }, []);

  const copyImageUrl = useCallback(async () => {
    const url = currentUrl.trim();
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
  }, [currentUrl]);

  const downloadImage = useCallback(async () => {
    const url = currentUrl.trim();
    if (!url || downloading) return;
    setDownloading(true);
    try {
      await downloadArticleContentImage(url, runtimeBase);
    } catch {
      // ignore download errors
    } finally {
      setDownloading(false);
    }
  }, [currentUrl, downloading, runtimeBase]);

  const goPrev = useCallback(() => {
    setCurrentIndex(index => Math.max(0, index - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex(index => Math.min(urls.length - 1, index + 1));
  }, [urls.length]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (scale <= 1 || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    panRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: translate.x,
      originY: translate.y,
      moved: false,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [scale, translate.x, translate.y]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan.active || event.pointerId !== pan.pointerId) return;

    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      pan.moved = true;
    }

    setTranslate({
      x: pan.originX + dx,
      y: pan.originY + dy,
    });
  }, []);

  const endPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan.active || event.pointerId !== pan.pointerId) return;

    pan.active = false;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
    const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;

    pinchRef.current = {
      active: true,
      startDistance: distanceBetweenTouches(Array.from(event.touches)),
      startScale: scale,
      startTranslateX: translate.x,
      startTranslateY: translate.y,
      centerX: centerX - rect.left - rect.width / 2,
      centerY: centerY - rect.top - rect.height / 2,
    };
  }, [scale, translate.x, translate.y]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (!pinch.active || event.touches.length !== 2) return;

    event.preventDefault();
    const distance = distanceBetweenTouches(Array.from(event.touches));
    if (!pinch.startDistance) return;

    const nextScale = clampScale(pinch.startScale * (distance / pinch.startDistance));
    const ratio = nextScale / pinch.startScale;

    setScale(nextScale);
    if (nextScale === 1) {
      setTranslate({ x: 0, y: 0 });
      return;
    }

    setTranslate({
      x: pinch.centerX - ratio * (pinch.centerX - pinch.startTranslateX),
      y: pinch.centerY - ratio * (pinch.centerY - pinch.startTranslateY),
    });
  }, []);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current.active = false;
  }, []);

  const handleViewportClick = useCallback(() => {
    if (scale > 1 || panRef.current.moved) return;
    onClose();
  }, [onClose, scale]);

  const handleImageDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (scale > 1) {
      resetZoom();
      return;
    }
    applyZoomAtPoint(2, event.clientX, event.clientY);
  }, [applyZoomAtPoint, resetZoom, scale]);

  const scaleRef = useRef(scale);
  const translateRef = useRef(translate);
  scaleRef.current = scale;
  translateRef.current = translate;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;

      event.preventDefault();
      event.stopPropagation();

      const zoomFactor = Math.exp(-event.deltaY * 0.01);
      const nextScale = clampScale(scaleRef.current * zoomFactor);
      applyZoomAtPoint(nextScale, event.clientX, event.clientY);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [applyZoomAtPoint, currentUrl]);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, urls]);

  useEffect(() => {
    setUrlCopied(false);
    resetZoom();
  }, [currentIndex, currentUrl, resetZoom]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (scale > 1) {
          resetZoom();
          return;
        }
        onClose();
      } else if (event.key === "ArrowLeft" && scale === 1) {
        goPrev();
      } else if (event.key === "ArrowRight" && scale === 1) {
        goNext();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goPrev, goNext, resetZoom, scale]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!currentUrl) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      onClick={scale === 1 ? onClose : undefined}
    >
      <div
        className="flex items-center justify-end gap-2 px-4 py-3 shrink-0"
        onClick={event => event.stopPropagation()}
      >
        {hasMultiple ? (
          <span className="mr-auto text-xs text-white/60 tabular-nums">
            {currentIndex + 1} / {urls.length}
            {scale > 1 ? (
              <span className="ml-2 text-white/40">{Math.round(scale * 100)}%</span>
            ) : null}
          </span>
        ) : scale > 1 ? (
          <span className="mr-auto text-xs text-white/60 tabular-nums">
            {Math.round(scale * 100)}%
          </span>
        ) : null}
        {scale > 1 ? (
          <button
            type="button"
            onClick={resetZoom}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
          >
            重置
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void copyImageUrl()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors"
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
          {urlCopied ? "已复制" : "复制链接"}
        </button>
        <button
          type="button"
          onClick={() => void downloadImage()}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <Icon name="download" className={`w-4 h-4${downloading ? " animate-pulse" : ""}`} />
          下载图片
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="关闭预览"
        >
          <Icon name="close" className="w-5 h-5" />
        </button>
      </div>

      <div
        ref={viewportRef}
        className={`relative flex-1 min-h-0 overflow-hidden px-4 sm:px-12 pb-6 touch-none${scale > 1 ? " cursor-grab" : ""}${isPanning ? " cursor-grabbing" : ""}`}
        onClick={handleViewportClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {hasMultiple ? (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              goPrev();
            }}
            disabled={currentIndex === 0 || scale > 1}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 disabled:opacity-20 disabled:pointer-events-none transition-all"
            aria-label="上一张"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        ) : null}

        <div className="flex h-full w-full items-center justify-center">
          <div
            className="max-h-full max-w-full"
            style={{
              transform: `translate3d(${translate.x}px, ${translate.y}px, 0) scale(${scale})`,
              transition: isPanning ? "none" : "transform 0.08s ease-out",
              transformOrigin: "center center",
            }}
            onClick={event => event.stopPropagation()}
            onDoubleClick={handleImageDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          >
            <ProxiedImage
              key={currentUrl}
              runtimeBase={runtimeBase}
              src={currentUrl}
              alt=""
              className="max-w-full max-h-[calc(100vh-7rem)] object-contain select-none pointer-events-none"
              draggable={false}
            />
          </div>
        </div>

        {hasMultiple ? (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              goNext();
            }}
            disabled={currentIndex === urls.length - 1 || scale > 1}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 disabled:opacity-20 disabled:pointer-events-none transition-all"
            aria-label="下一张"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
