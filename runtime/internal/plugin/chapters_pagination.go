package plugin

func chapterPageSize(features ResolvedFeatures) int {
	if features.Chapters == nil || features.Chapters.Pagination == nil {
		return 0
	}
	return DefaultFeedPageSize
}

func chapterListHasMore(loadedCount, cachedTotal int, apiHasMore bool) bool {
	return loadedCount < cachedTotal || apiHasMore
}

func chapterPageItems(items []FeedItem, pageSize, offset int) []FeedItem {
	if pageSize <= 0 || len(items) == 0 || offset >= len(items) {
		return nil
	}
	page := paginateItems(items, pageSize, offset)
	if page == nil {
		return []FeedItem{}
	}
	return page
}

func trimChapterPage(items []FeedItem, pageSize int) []FeedItem {
	if pageSize <= 0 || len(items) == 0 {
		return items
	}
	if len(items) <= pageSize {
		return items
	}
	return items[:pageSize]
}
