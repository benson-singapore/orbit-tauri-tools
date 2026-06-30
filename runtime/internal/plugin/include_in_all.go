package plugin

import "strings"

// DefaultIncludeInAll returns whether a newly installed plugin should appear in Today 全部.
// Only article plugins default to true; mature (18+) plugins always default to false.
func DefaultIncludeInAll(mediaType, contentRating string) bool {
	if IsMatureContentRating(contentRating) {
		return false
	}
	return strings.TrimSpace(mediaType) == MediaArticle || strings.TrimSpace(mediaType) == MediaNovel
}

func pluginIncludesInAllFeed(rec *PluginRecord) bool {
	if rec == nil {
		return false
	}
	return rec.IncludeInAll
}
