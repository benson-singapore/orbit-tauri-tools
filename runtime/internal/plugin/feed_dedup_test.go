package plugin

import (
	"testing"

	"github.com/orbit-tauri-tools/runtime/internal/store"
)

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
		{
			name: "yilin parent issue",
			item: FeedItem{
				ID:        "yilin:issues:www.yilinzazhi.com/2025/20258/index.html",
				PluginID:  "yilin",
				ChannelID: "issues",
			},
			want: "www.yilinzazhi.com/2025/20258/index.html",
		},
		{
			name: "yilin chapter item",
			item: FeedItem{
				ID:        "yilin:issues:www.yilinzazhi.com/2025/20258/index.html:www.yilinzazhi.com/2025/20258/articles/AIxieshilangmandejinhua.html",
				PluginID:  "yilin",
				ChannelID: "issues",
			},
			want: "www.yilinzazhi.com/2025/20258/articles/AIxieshilangmandejinhua.html",
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

func TestNativeChapterID(t *testing.T) {
	tests := []struct {
		parent, raw, want string
	}{
		{"26", "26:23072935", "23072935"},
		{"26", "23072935", "23072935"},
		{"26", "hjd2048:boards:26:23072935", "hjd2048:boards:26:23072935"},
	}
	for _, tt := range tests {
		if got := nativeChapterID(tt.parent, tt.raw); got != tt.want {
			t.Fatalf("nativeChapterID(%q, %q) = %q, want %q", tt.parent, tt.raw, got, tt.want)
		}
	}
}

func TestChapterFullIDLookupForHjd2048(t *testing.T) {
	parentID := "26"
	chapterID := "26:23072935"
	native := nativeChapterID(parentID, chapterID)
	fullID := ChapterFullID("hjd2048", "boards", parentID, native)
	if fullID != "hjd2048:boards:26:23072935" {
		t.Fatalf("fullID = %q", fullID)
	}
}

func TestParamsForChapterDetailHjd2048(t *testing.T) {
	features := ResolvedFeatures{
		Chapters: &ResolvedChaptersFeature{
			Detail: &ResolvedChapterDetailFeature{
				Route:       "/hjd2048/detail/:id",
				IDParam:     "id",
				ParentParam: "parentId",
			},
		},
	}
	parent := FeedItem{ID: "26", PluginID: "hjd2048", ChannelID: "boards"}
	chapter := FeedItem{ID: "26:23072935", PluginID: "hjd2048", ChannelID: "boards"}
	route, params := ParamsForChapterDetail(features, parent, chapter)
	if route != "/hjd2048/detail/:id" {
		t.Fatalf("route = %q", route)
	}
	if params["parentId"] != "26" || params["id"] != "23072935" {
		t.Fatalf("params = %#v", params)
	}
}

func TestResolveChapterParentID(t *testing.T) {
	item := FeedItem{
		ID:        "2025-08",
		PluginID:  "yilin",
		ChannelID: "issues",
	}
	if got := resolveChapterParentID("yilin", "issues", item); got != "2025-08" {
		t.Fatalf("native id = %q, want 2025-08", got)
	}

	full := FeedItem{
		ID:        "yilin:issues:2025-08",
		PluginID:  "yilin",
		ChannelID: "issues",
	}
	if got := resolveChapterParentID("yilin", "issues", full); got != "2025-08" {
		t.Fatalf("full id = %q, want 2025-08", got)
	}

	legacy := FeedItem{
		ID:       "yilin:issues:2025-08",
		PluginID: "yilin",
	}
	if got := resolveChapterParentID("yilin", "issues", legacy); got != "2025-08" {
		t.Fatalf("legacy id = %q, want 2025-08", got)
	}
}

func TestMergeChapterListsForRefresh(t *testing.T) {
	existing := []FeedItem{
		{ID: "p:1", PluginID: "p", ChannelID: "c"},
		{ID: "p:2", PluginID: "p", ChannelID: "c"},
	}
	fetched := []FeedItem{
		{ID: "p:3", PluginID: "p", ChannelID: "c"},
		{ID: "p:1", PluginID: "p", ChannelID: "c"},
	}
	merged := mergeChapterListsForRefresh(fetched, existing)
	if len(merged) != 3 {
		t.Fatalf("merged len = %d, want 3", len(merged))
	}
	if merged[0].ID != "p:3" || merged[1].ID != "p:1" || merged[2].ID != "p:2" {
		t.Fatalf("unexpected order: %+v", merged)
	}
}

func TestChapterItemIDForAPI(t *testing.T) {
	row := store.ChapterItemRow{
		ID:        "hjd2048:boards:26:23072935",
		PluginID:  "hjd2048",
		ChannelID: "boards",
		ParentID:  "26",
	}
	if got := chapterItemIDForAPI(row); got != "26:23072935" {
		t.Fatalf("chapterItemIDForAPI() = %q, want 26:23072935", got)
	}
}

func TestExtractNativeIDFromRestPreservesHTTPURL(t *testing.T) {
	const url = "https://www.zaobao.com/news/china/story20260617-9217994"
	if got := extractNativeIDFromRest(url); got != url {
		t.Fatalf("extractNativeIDFromRest() = %q, want %q", got, url)
	}
}

func TestExtractThirdPartyFeedIDZaobaoURL(t *testing.T) {
	item := FeedItem{
		ID:        "zaobao:china:https://www.zaobao.com/news/china/story20260617-9217994",
		PluginID:  "zaobao",
		ChannelID: "china",
	}
	want := "https://www.zaobao.com/news/china/story20260617-9217994"
	if got := extractThirdPartyFeedID(item); got != want {
		t.Fatalf("extractThirdPartyFeedID() = %q, want %q", got, want)
	}
}
