import { useCallback, useRef, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ArticleDetailPanel } from "@/components/ArticleDetailPanel";
import { RatingFocusView } from "@/components/RatingFocusView";
import { useSplitPaneAutoGridColumns } from "@/hooks/useSplitPaneAutoGridColumns";
import {
  clampSplitPaneRatio,
} from "@/lib/splitPaneRatio";
import type { GridColumnCount } from "@/lib/gridColumnCount";
import type { GridCoverAspectRatio } from "@/lib/gridCoverAspectRatio";
import type { NovelReaderSettings } from "@/lib/novelReaderSettings";
import type { ExperienceMode } from "@/lib/experienceMode";
import type { Article, ChannelCapabilities, Plugin, ThemeMode } from "@/types";

interface SplitGridDetailViewProps {
  theme: ThemeMode;
  runtimeBase: string | null;
  articles: Article[];
  selectedArticle: Article | null;
  gridColumnCount: GridColumnCount;
  onGridColumnCountChange: (count: GridColumnCount) => void;
  coverAspectRatio: GridCoverAspectRatio;
  splitRatio: number;
  onSplitRatioChange: (ratio: number) => void;
  readerFontScale: number;
  comicPageWidth?: number;
  readerContentWidth?: number;
  novelReaderSettings?: NovelReaderSettings;
  hasDetail: boolean;
  activeChannel: string;
  pluginMeta?: Plugin;
  channelCapabilities: ChannelCapabilities;
  storedChannel?: string | null;
  experienceMode?: ExperienceMode;
  loading: boolean;
  loadingMore: boolean;
  searching?: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onItemSelect: (article: Article) => void;
  showFavorites?: boolean;
  favoritedArticleIds?: Set<string>;
  onToggleFavorite?: (article: Article, event: MouseEvent) => void;
}

export function splitDetailSessionId(article: Pick<Article, "id" | "pluginId">): string {
  return `split-detail:${article.pluginId}:${article.id}`;
}

export function SplitGridDetailView({
  theme,
  runtimeBase,
  articles,
  selectedArticle,
  gridColumnCount,
  onGridColumnCountChange,
  coverAspectRatio,
  splitRatio,
  onSplitRatioChange,
  readerFontScale,
  comicPageWidth,
  readerContentWidth,
  novelReaderSettings,
  hasDetail,
  activeChannel,
  pluginMeta,
  channelCapabilities,
  storedChannel,
  experienceMode = "safe",
  loading,
  loadingMore,
  searching = false,
  hasMore,
  onLoadMore,
  onItemSelect,
  showFavorites = false,
  favoritedArticleIds,
  onToggleFavorite,
}: SplitGridDetailViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const leftPercent = clampSplitPaneRatio(splitRatio) * 100;

  useSplitPaneAutoGridColumns(leftPaneRef, onGridColumnCountChange);

  const handleDividerPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = event.clientX;
    const startRatio = clampSplitPaneRatio(splitRatio);
    const latestRatioRef = { current: startRatio };

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextRatio = clampSplitPaneRatio(startRatio + delta / rect.width);
      latestRatioRef.current = nextRatio;
      onSplitRatioChange(nextRatio);
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
  }, [onSplitRatioChange, splitRatio]);

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full">
      <div
        ref={leftPaneRef}
        className="min-h-0 min-w-0 overflow-y-auto"
        style={{ width: `${leftPercent}%` }}
      >
        <RatingFocusView
          theme={theme}
          runtimeBase={runtimeBase}
          articles={articles}
          columnCount={gridColumnCount}
          coverAspectRatio={coverAspectRatio}
          selectedArticleId={selectedArticle?.id}
          loading={loading}
          loadingMore={loadingMore}
          searching={searching}
          hasMore={hasMore}
          onLoadMore={onLoadMore}
          onItemSelect={onItemSelect}
          scrollRootRef={leftPaneRef}
          showFavorites={showFavorites}
          favoritedArticleIds={favoritedArticleIds}
          onToggleFavorite={onToggleFavorite}
        />
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左右分屏宽度"
        onPointerDown={handleDividerPointerDown}
        className="orbit-split-divider group relative z-10 w-2 shrink-0 cursor-col-resize touch-none"
      >
        <div className="orbit-split-divider-handle absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2" />
      </div>

      <div className="orbit-detail-panel orbit-reader-chrome min-h-0 min-w-0 flex-1 overflow-hidden border-l">
        {selectedArticle ? (
          <ArticleDetailPanel
            key={splitDetailSessionId(selectedArticle)}
            sessionId={splitDetailSessionId(selectedArticle)}
            theme={theme}
            runtimeBase={runtimeBase}
            article={selectedArticle}
            readerFontScale={readerFontScale}
            comicPageWidth={comicPageWidth}
            readerContentWidth={readerContentWidth}
            novelReaderSettings={novelReaderSettings}
            hasDetail={hasDetail}
            activeChannel={activeChannel}
            pluginMeta={pluginMeta}
            channelCapabilities={channelCapabilities}
            storedChannel={storedChannel}
            experienceMode={experienceMode}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="text-sm orbit-detail-meta">
              点击左侧条目，详情将在此展示
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
