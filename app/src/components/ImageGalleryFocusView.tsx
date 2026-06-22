import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { isDarkTheme } from "@/lib/themeMode";
import { ImageLightbox, type GalleryImageItem } from "@/components/ImageLightbox";
import { ProxiedImage } from "@/components/ProxiedImage";
import type { Article, ThemeMode } from "@/types";

interface ImageGalleryFocusViewProps {
  theme: ThemeMode;
  runtimeBase: string | null;
  articles: Article[];
  columnCount?: number;
  loading: boolean;
  loadingMore: boolean;
  searching?: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onImageOpen?: (articleId: string) => void;
  onItemDetailRequest?: (article: Article) => void;
  scrollRootRef?: RefObject<HTMLElement | null>;
}

function resolveColumnCount(width: number): number {
  if (width < 480) return 2;
  if (width < 720) return 3;
  if (width < 1024) return 4;
  if (width < 1400) return 5;
  return 6;
}

const COLUMN_GAP_PX = 8;

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

type ColumnEntry = { item: GalleryImageItem; lightboxIndex: number };

function distributeShortestColumn(
  entries: ColumnEntry[],
  columnCount: number,
  columnWidth: number,
  aspectRatios: Record<string, number>,
  defaultAspectRatio: number,
): ColumnEntry[][] {
  const cols: ColumnEntry[][] = Array.from({ length: columnCount }, () => []);
  const colHeights = Array(columnCount).fill(0);

  for (const entry of entries) {
    const ratio = aspectRatios[entry.item.id] ?? defaultAspectRatio;
    let shortest = 0;
    for (let i = 1; i < columnCount; i++) {
      if (colHeights[i] < colHeights[shortest]) {
        shortest = i;
      }
    }
    cols[shortest].push(entry);
    colHeights[shortest] += columnWidth * ratio + COLUMN_GAP_PX;
  }

  return cols;
}

export function ImageGalleryFocusView({
  theme,
  runtimeBase,
  articles,
  columnCount,
  loading,
  loadingMore,
  searching = false,
  hasMore,
  onLoadMore,
  onImageOpen,
  onItemDetailRequest,
  scrollRootRef,
}: ImageGalleryFocusViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const columnSentinelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [autoColumns, setAutoColumns] = useState(4);
  const [containerWidth, setContainerWidth] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});

  const columns = columnCount ?? autoColumns;

  const galleryItems = useMemo(
    () =>
      articles
        .map(articleToGalleryItem)
        .filter((item): item is GalleryImageItem => item !== null && !failedIds.has(item.id)),
    [articles, failedIds],
  );

  const defaultAspectRatio = useMemo(() => {
    const ratios = Object.values(aspectRatios);
    if (ratios.length === 0) return 1;
    return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  }, [aspectRatios]);

  const columnEntries = useMemo(() => {
    const entries: ColumnEntry[] = [];
    let lightboxIndex = 0;
    articles.forEach(article => {
      const item = articleToGalleryItem(article);
      if (!item || failedIds.has(item.id)) return;
      entries.push({ item, lightboxIndex });
      lightboxIndex += 1;
    });
    return entries;
  }, [articles, failedIds]);

  const columnWidth = useMemo(() => {
    if (containerWidth <= 0 || columns <= 0) return 0;
    return (containerWidth - COLUMN_GAP_PX * (columns - 1)) / columns;
  }, [containerWidth, columns]);

  const galleryColumns = useMemo(() => {
    if (columnWidth <= 0) {
      const cols = Array.from({ length: columns }, () => [] as ColumnEntry[]);
      columnEntries.forEach((entry, index) => {
        cols[index % columns].push(entry);
      });
      return cols;
    }
    return distributeShortestColumn(
      columnEntries,
      columns,
      columnWidth,
      aspectRatios,
      defaultAspectRatio,
    );
  }, [columnEntries, columns, columnWidth, aspectRatios, defaultAspectRatio]);

  const handleImageLoad = useCallback((id: string, img: HTMLImageElement) => {
    const { naturalWidth, naturalHeight } = img;
    if (naturalWidth <= 0 || naturalHeight <= 0) return;
    const ratio = naturalHeight / naturalWidth;
    setAspectRatios(prev => (prev[id] === ratio ? prev : { ...prev, [id]: ratio }));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setContainerWidth(el.clientWidth);
      if (columnCount == null) {
        setAutoColumns(resolveColumnCount(el.clientWidth));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [columnCount]);

  useEffect(() => {
    if (!hasMore || loadingMore || loading || searching) return;

    const sentinels = columnSentinelRefs.current.filter(
      (node): node is HTMLDivElement => node !== null,
    );
    if (sentinels.length === 0) return;

    let cooldown = false;
    const observer = new IntersectionObserver(
      entries => {
        if (cooldown || !entries.some(entry => entry.isIntersecting)) return;
        cooldown = true;
        onLoadMore();
        window.setTimeout(() => {
          cooldown = false;
        }, 600);
      },
      { root: scrollRootRef?.current ?? null, rootMargin: "800px" },
    );
    sentinels.forEach(sentinel => observer.observe(sentinel));
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, searching, onLoadMore, galleryColumns, scrollRootRef]);

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

  const handleItemClick = useCallback(
    (article: Article, lightboxIndex: number) => {
      if (onItemDetailRequest) {
        onItemDetailRequest(article);
        return;
      }
      openLightbox(lightboxIndex);
    },
    [onItemDetailRequest, openLightbox],
  );

  const handleNearEnd = useCallback(() => {
    if (hasMore && !loadingMore) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  if ((loading || searching) && galleryItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
          {searching ? "正在搜索…" : "正在加载图片…"}
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
              {column.map(({ item, lightboxIndex }) => {
                const article = articles.find(entry => entry.id === item.id);
                return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (article) {
                      handleItemClick(article, lightboxIndex);
                    } else {
                      openLightbox(lightboxIndex);
                    }
                  }}
                  className={`group relative w-full rounded-lg overflow-hidden cursor-pointer block ${
                    isDarkTheme(theme) ? "bg-neutral-800" : "bg-neutral-100"
                  }`}
                >
                  <ProxiedImage
                    runtimeBase={runtimeBase}
                    src={item.url}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-auto block transition-transform duration-300 group-hover:scale-[1.02]"
                    onLoad={event => handleImageLoad(item.id, event.currentTarget)}
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
              );
              })}
              <div
                ref={node => {
                  columnSentinelRefs.current[columnIndex] = node;
                }}
                className="h-1 w-full shrink-0"
                aria-hidden
              />
            </div>
          ))}
        </div>

        {loadingMore ? (
          <div className="flex items-center justify-center py-6">
            <span className="inline-block w-4 h-4 border-2 border-neutral-300 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : null}
      </div>

      {lightboxIndex !== null ? (
        <ImageLightbox
          runtimeBase={runtimeBase}
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
