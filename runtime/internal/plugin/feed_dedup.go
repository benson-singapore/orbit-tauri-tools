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
			rest = strings.TrimSpace(strings.TrimPrefix(rest, channelPrefix))
			return extractNativeIDFromRest(rest)
		}
	}

	return extractNativeIDFromRest(rest)
}

func extractNativeIDFromRest(rest string) string {
	rest = strings.TrimSpace(rest)
	if rest == "" {
		return ""
	}
	// Chapter rows encode parentNativeId:chapterNativeId after plugin/channel prefix.
	if strings.Contains(rest, ":") && strings.Contains(rest, "/") {
		if idx := strings.LastIndex(rest, ":"); idx >= 0 && idx < len(rest)-1 {
			return strings.TrimSpace(rest[idx+1:])
		}
	}
	return rest
}

func chapterParentID(item FeedItem) string {
	if id := extractThirdPartyFeedID(item); id != "" {
		return id
	}
	return strings.TrimSpace(item.ID)
}

func resolveChapterParentID(pluginID, channelID string, item FeedItem) string {
	pluginID = strings.TrimSpace(pluginID)
	channelID = strings.TrimSpace(channelID)
	itemPlugin := strings.TrimSpace(item.PluginID)
	if itemPlugin == "" {
		itemPlugin = pluginID
	}
	itemChannel := strings.TrimSpace(item.ChannelID)
	if itemChannel == "" {
		itemChannel = channelID
	}

	rawID := strings.TrimSpace(item.ID)
	if rawID == "" {
		return ""
	}

	fullID := rawID
	switch {
	case itemPlugin != "" && itemChannel != "" && !strings.HasPrefix(rawID, itemPlugin+":"):
		fullID = FeedFullID(itemPlugin, itemChannel, rawID)
	case pluginID != "" && channelID != "" && !strings.HasPrefix(rawID, pluginID+":"):
		fullID = FeedFullID(pluginID, channelID, rawID)
	}

	if native := extractThirdPartyFeedID(FeedItem{
		ID:        fullID,
		PluginID:  itemPlugin,
		ChannelID: itemChannel,
	}); native != "" {
		return native
	}
	return chapterParentID(item)
}

func chapterParentIDCandidates(pluginID, channelID string, item FeedItem) []string {
	primary := resolveChapterParentID(pluginID, channelID, item)
	seen := map[string]struct{}{}
	out := make([]string, 0, 4)
	add := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	add(primary)
	add(chapterParentID(item))
	add(item.ID)
	return out
}

// nativeChapterID returns the source-native chapter id without a leading parent prefix.
// WASM plugins often use composite ids like "26:23072935" while storage keys keep only "23072935".
func mergeChapterItemLists(existing, fetched []FeedItem) []FeedItem {
	if len(fetched) == 0 {
		return append([]FeedItem(nil), existing...)
	}
	if len(existing) == 0 {
		return append([]FeedItem(nil), fetched...)
	}
	seen := make(map[string]struct{}, len(existing)+len(fetched))
	out := make([]FeedItem, 0, len(existing)+len(fetched))
	for _, item := range existing {
		key := feedItemDedupKey(item)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, item)
	}
	for _, item := range fetched {
		key := feedItemDedupKey(item)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, item)
	}
	return out
}

// mergeChapterListsForRefresh places freshly fetched items first while keeping existing entries.
func mergeChapterListsForRefresh(fetched, existing []FeedItem) []FeedItem {
	if len(fetched) == 0 {
		return append([]FeedItem(nil), existing...)
	}
	if len(existing) == 0 {
		return append([]FeedItem(nil), fetched...)
	}
	seen := make(map[string]struct{}, len(existing)+len(fetched))
	out := make([]FeedItem, 0, len(existing)+len(fetched))
	for _, item := range fetched {
		key := feedItemDedupKey(item)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, item)
	}
	for _, item := range existing {
		key := feedItemDedupKey(item)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, item)
	}
	return out
}

func nativeChapterID(parentID, rawID string) string {
	parentID = strings.TrimSpace(parentID)
	rawID = strings.TrimSpace(rawID)
	if rawID == "" {
		return ""
	}
	if parentID != "" {
		prefix := parentID + ":"
		if strings.HasPrefix(rawID, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(rawID, prefix))
		}
	}
	return rawID
}
