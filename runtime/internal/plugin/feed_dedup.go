package plugin

import "strings"

// dedupeFeedItems removes duplicate articles when the same item was fetched into
// multiple channels of one plugin. Callers should sort by PublishedAt descending
// first so the newest copy is kept.
func dedupeFeedItems(items []FeedItem) []FeedItem {
	if len(items) <= 1 {
		return items
	}
	seen := make(map[string]struct{}, len(items))
	out := make([]FeedItem, 0, len(items))
	for _, item := range items {
		key := feedItemDedupKey(item)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, item)
	}
	return out
}

func feedItemDedupKey(item FeedItem) string {
	pluginID := strings.TrimSpace(item.PluginID)
	if ext := extractThirdPartyFeedID(item); ext != "" {
		return pluginID + "\x1e" + "id:" + ext
	}
	title := strings.ToLower(strings.TrimSpace(item.Title))
	if title != "" {
		return pluginID + "\x1e" + "title:" + title
	}
	return pluginID + "\x1e" + "row:" + item.ID
}

// extractThirdPartyFeedID returns the source-native article id encoded in our row id.
// WASM plugins use "{pluginID}:{channelID}:{thirdPartyID}".
// RSS plugins use "{pluginID}:{hash}" derived from the feed guid.
func extractThirdPartyFeedID(item FeedItem) string {
	pluginID := strings.TrimSpace(item.PluginID)
	if pluginID == "" {
		return ""
	}
	prefix := pluginID + ":"
	if !strings.HasPrefix(item.ID, prefix) {
		return ""
	}
	rest := strings.TrimPrefix(item.ID, prefix)
	if rest == "" {
		return ""
	}

	channelID := strings.TrimSpace(item.ChannelID)
	if channelID != "" {
		channelPrefix := channelID + ":"
		if strings.HasPrefix(rest, channelPrefix) {
			return strings.TrimSpace(strings.TrimPrefix(rest, channelPrefix))
		}
	}

	if !strings.Contains(rest, ":") {
		return strings.TrimSpace(rest)
	}

	if idx := strings.LastIndex(rest, ":"); idx >= 0 && idx < len(rest)-1 {
		return strings.TrimSpace(rest[idx+1:])
	}
	return ""
}
