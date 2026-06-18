package plugin

import "strings"

const (
	ContentRatingGeneral = "general"
	ContentRatingUnder18 = "under18"
	ContentRatingMature  = "mature"
)

func NormalizeContentRating(raw string) string {
	switch strings.TrimSpace(raw) {
	case ContentRatingGeneral, ContentRatingUnder18, ContentRatingMature:
		return strings.TrimSpace(raw)
	default:
		return ""
	}
}

func IsMatureContentRating(rating string) bool {
	return NormalizeContentRating(rating) == ContentRatingMature
}

func isGlobalAggregateFeed(pluginID string, scopePluginIDs []string) bool {
	if len(scopePluginIDs) > 0 {
		return false
	}
	pluginID = strings.TrimSpace(pluginID)
	return pluginID == "" || pluginID == "all"
}
