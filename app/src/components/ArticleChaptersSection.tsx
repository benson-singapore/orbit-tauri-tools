import { ChaptersList } from "@/components/ChaptersList";
import { useArticleChapters } from "@/hooks/useArticleChapters";
import type { Article, ChannelCapabilities, Plugin, ThemeMode } from "@/types";

interface ArticleChaptersSectionProps {
  parent: Article;
  theme: ThemeMode;
  activeChannel: string;
  pluginMeta?: Plugin;
  capabilities: Pick<
    ChannelCapabilities,
    | "hasChapters"
    | "chaptersLabel"
    | "chaptersItemLabel"
    | "canRefreshChapters"
    | "canLoadMoreChapters"
  >;
  storedChannel?: string | null;
  activeItemId?: string | null;
  onChapterDetail: (article: Article) => void;
}

export function ArticleChaptersSection({
  parent,
  theme,
  activeChannel,
  pluginMeta,
  capabilities,
  storedChannel,
  activeItemId,
  onChapterDetail,
}: ArticleChaptersSectionProps) {
  const chapters = useArticleChapters({
    parent,
    activeChannel,
    pluginMeta,
    capabilities,
    storedChannel,
    onChapterDetail,
  });

  if (!chapters.isActive) return null;

  return (
    <ChaptersList
      theme={theme}
      variant="inline"
      title={chapters.title}
      items={chapters.items}
      loading={chapters.loading}
      loadingMore={chapters.loadingMore}
      refreshing={chapters.refreshing}
      hasMore={chapters.hasMore}
      canLoadMore={capabilities.canLoadMoreChapters}
      canRefresh={capabilities.canRefreshChapters || capabilities.hasChapters}
      parentItem={parent}
      activeItemId={activeItemId ?? chapters.activeChapter?.id}
      itemLabel={capabilities.chaptersItemLabel}
      onSelect={chapter => {
        void chapters.selectChapter(chapter);
      }}
      onLoadMore={chapters.loadMore}
      onRefresh={chapters.refresh}
      onClearAndRefresh={chapters.clearAndRefresh}
    />
  );
}

export { useArticleChapters };
