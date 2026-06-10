import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ImageLightbox, type GalleryImageItem } from "@/components/ImageLightbox";
import type { Article, ThemeMode } from "@/types";

interface ImageGalleryFocusViewProps {
  theme: ThemeMode;
  articles: Article[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onImageOpen?: (articleId: string) => void;
  scrollRootRef?: RefObject<HTMLElement | null>;
}

function resolveColumnCount(width: number): number {
  if (width < 480) return 2;
  if (width < 720) return 3;
  if (width < 1024) return 4;
  if (width < 1400) return 5;
  return 6;
}

function articleToGalleryItem(article: Article): GalleryImageItem | null {
  const url = article.image?.trim();
  if (!url) return null;
  return {
    id: article.id,
    url,
    title: article.title,
    author: article.author,
  };
}

export function ImageGalleryFocusView({
  theme,
  articles,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onImageOpen,
  scrollRootRef,
}: ImageGalleryFocusViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const galleryItems = useMemo(
    () =>
      articles
        .map(articleToGalleryItem)
        .filter((item): item is GalleryImageItem => item !== null && !failedIds.has(item.id)),
    [articles, failedIds],
  );

  const galleryColumns = useMemo(() => {
    const cols: { item: GalleryImageItem; lightboxIndex: number }[][] = Array.from(
      { length: columns },
      () => [],
    );
    let lightboxIndex = 0;
    articles.forEach((article, articleIndex) => {
      const item = articleToGalleryItem(article);
      if (!item || failedIds.has(item.id)) return;
      cols[articleIndex % columns].push({ item, lightboxIndex });
      lightboxIndex += 1;
    });
    return cols;
  }, [articles, columns, failedIds]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setColumns(resolveColumnCount(el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loadingMore || loading) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onLoadMore();
        }
      },
      { root: scrollRootRef?.current ?? null, rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, onLoadMore, galleryItems.length, scrollRootRef]);

  const openLightbox = useCallback(
    (index: number) => {
      setLightboxIndex(index);
      const item = galleryItems[index];
      if (item) {
        onImageOpen?.(item.id);
      }
    },
    [galleryItems, onImageOpen],
  );

  const handleNearEnd = useCallback(() => {
    if (hasMore && !loadingMore) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  if (loading && galleryItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
          正在加载图片…
        </div>
      </div>
    );
  }

  if (galleryItems.length === 0) {
    return (
      <div className="text-center py-24">
        <p className="text-sm text-neutral-400">暂无图片</p>
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="w-full">
        <div className="flex w-full gap-2 items-start">
          {galleryColumns.map((column, columnIndex) => (
            <div key={columnIndex} className="flex-1 min-w-0 flex flex-col gap-2">
              {column.map(({ item, lightboxIndex }) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openLightbox(lightboxIndex)}
                  className={`group relative w-full rounded-lg overflow-hidden cursor-pointer block ${
                    theme === "dark" ? "bg-neutral-800" : "bg-neutral-100"
                  }`}
                >
                  <img
                    src={item.url}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-auto block transition-transform duration-300 group-hover:scale-[1.02]"
                    onError={() => {
                      setFailedIds(prev => new Set(prev).add(item.id));
                    }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
                  {item.title ? (
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[11px] text-white truncate">{item.title}</p>
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div ref={sentinelRef} className="h-4 w-full" aria-hidden />

        {loadingMore ? (
          <div className="flex items-center justify-center py-6">
            <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : null}
      </div>

      {lightboxIndex !== null ? (
        <ImageLightbox
          images={galleryItems}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
          onNearEnd={handleNearEnd}
        />
      ) : null}
    </>
  );
}
