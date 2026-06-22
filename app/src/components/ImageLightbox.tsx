import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ProxiedImage } from "@/components/ProxiedImage";

export interface GalleryImageItem {
  id: string;
  url: string;
  title: string;
  author?: string;
}

interface ImageLightboxProps {
  runtimeBase: string | null;
  images: GalleryImageItem[];
  currentIndex: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onNearEnd?: () => void;
}

export function ImageLightbox({
  runtimeBase,
  images,
  currentIndex,
  onClose,
  onIndexChange,
  onNearEnd,
}: ImageLightboxProps) {
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const current = images[currentIndex];

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

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setUrlCopied(false);
  }, [currentIndex]);

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
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
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

      <div className="relative flex-1 flex items-center justify-center min-h-0 px-12">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="absolute left-2 sm:left-4 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 disabled:opacity-20 disabled:pointer-events-none transition-all"
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
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
        />

        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === images.length - 1}
          className="absolute right-2 sm:right-4 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 disabled:opacity-20 disabled:pointer-events-none transition-all"
          aria-label="下一张"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <div
        ref={thumbStripRef}
        className="shrink-0 px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar border-t border-white/10"
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
