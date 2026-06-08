package plugin

import "testing"

func TestDedupeFeedItemsByThirdPartyID(t *testing.T) {
	items := []FeedItem{
		{
			ID:          "juejin:android:article-1",
			PluginID:    "juejin",
			ChannelID:   "android",
			Title:       "Same story",
			PublishedAt: 200,
		},
		{
			ID:          "juejin:frontend:article-1",
			PluginID:    "juejin",
			ChannelID:   "frontend",
			Title:       "Same story",
			PublishedAt: 100,
		},
		{
			ID:          "juejin:android:article-2",
			PluginID:    "juejin",
			ChannelID:   "android",
			Title:       "Another story",
			PublishedAt: 50,
		},
	}

	got := dedupeFeedItems(items)
	if len(got) != 2 {
		t.Fatalf("dedupeFeedItems() len = %d, want 2", len(got))
	}
	if got[0].ID != "juejin:android:article-1" {
		t.Fatalf("first item id = %q, want newest duplicate kept", got[0].ID)
	}
	if got[1].ID != "juejin:android:article-2" {
		t.Fatalf("second item id = %q", got[1].ID)
	}
}

func TestDedupeFeedItemsByTitleWhenNoThirdPartyID(t *testing.T) {
	items := []FeedItem{
		{
			ID:          "row-without-plugin-prefix-a",
			PluginID:    "custom",
			Title:       "Duplicate headline",
			PublishedAt: 300,
		},
		{
			ID:          "row-without-plugin-prefix-b",
			PluginID:    "custom",
			Title:       "Duplicate headline",
			PublishedAt: 200,
		},
	}

	got := dedupeFeedItems(items)
	if len(got) != 1 {
		t.Fatalf("dedupeFeedItems() len = %d, want 1", len(got))
	}
	if got[0].PublishedAt != 300 {
		t.Fatalf("kept publishedAt = %d, want 300", got[0].PublishedAt)
	}
}

func TestExtractThirdPartyFeedID(t *testing.T) {
	tests := []struct {
		name string
		item FeedItem
		want string
	}{
		{
			name: "wasm channel scoped id",
			item: FeedItem{
				ID:        "juejin:android:7112345678901234567",
				PluginID:  "juejin",
				ChannelID: "android",
			},
			want: "7112345678901234567",
		},
		{
			name: "rss hash id",
			item: FeedItem{
				ID:       "rss-plugin:deadbeefcafebabe",
				PluginID: "rss-plugin",
			},
			want: "deadbeefcafebabe",
		},
		{
			name: "missing plugin prefix",
			item: FeedItem{
				ID:       "other:article-1",
				PluginID: "juejin",
			},
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := extractThirdPartyFeedID(tt.item); got != tt.want {
				t.Fatalf("extractThirdPartyFeedID() = %q, want %q", got, tt.want)
			}
		})
	}
}
