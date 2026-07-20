package plugin

import (
	"strings"
	"testing"
)

func TestListItemsShouldRefresh(t *testing.T) {
	refreshOn := ResolvedFeatures{
		Feed: ResolvedFeedFeature{Persist: false, Refresh: true},
	}
	refreshOff := ResolvedFeatures{
		Feed: ResolvedFeedFeature{Persist: false, Refresh: false},
	}

	if !listItemsShouldRefresh(refreshOn, 0, 0) {
		t.Fatal("expected auto refresh on empty first page")
	}
	if listItemsShouldRefresh(refreshOn, 20, 0) {
		t.Fatal("expected no auto refresh when offset > 0")
	}
	if listItemsShouldRefresh(refreshOn, 0, 3) {
		t.Fatal("expected no auto refresh when items already loaded")
	}
	if listItemsShouldRefresh(refreshOff, 0, 0) {
		t.Fatal("expected no auto refresh when feed.refresh is false")
	}
}

func TestAutoListRefreshOnce(t *testing.T) {
	sessions := NewSessionStore()
	pluginID := "gequbao"
	channelID := "douyin-hot"

	if !sessions.BeginAutoListRefresh(pluginID, channelID) {
		t.Fatal("first begin should succeed")
	}
	if !sessions.ListRefreshPending(pluginID, channelID) {
		t.Fatal("expected pending after begin")
	}
	if sessions.BeginAutoListRefresh(pluginID, channelID) {
		t.Fatal("second begin should be rejected while already requested")
	}
	if !sessions.ListRefreshPending(pluginID, channelID) {
		t.Fatal("pending should remain true until settled")
	}

	sessions.MarkListRefreshSettled(pluginID, channelID)
	if sessions.ListRefreshPending(pluginID, channelID) {
		t.Fatal("expected pending cleared after settle")
	}
	if sessions.BeginAutoListRefresh(pluginID, channelID) {
		t.Fatal("should not re-begin after settle without reset")
	}

	sessions.ResetAutoListRefresh(pluginID, channelID)
	if !sessions.BeginAutoListRefresh(pluginID, channelID) {
		t.Fatal("explicit reset should allow another begin")
	}
}

func TestChapterContentNeedsDetailFetch(t *testing.T) {
	cases := []struct {
		name    string
		content string
		want    bool
	}{
		{name: "empty", content: "", want: true},
		{name: "whitespace", content: "  \n", want: true},
		{name: "json pages", content: `["https://cdn.example.com/1.webp"]`, want: false},
		{name: "comic reader html", content: `<div class="comic-reader"><p>hi</p></div>`, want: false},
		{name: "html with images", content: `<p>x</p><img src="https://cdn.example.com/1.jpg">`, want: false},
		{
			name:    "gallery meta shell",
			content: `<article class="comic-detail"><section class="comic-detail-body">共 10 张 · 打开原网页</section></article>`,
			want:    true,
		},
		{
			name:    "open original link only",
			content: `<p><a href="#">打开原网页</a></p>`,
			want:    true,
		},
		{name: "novel text", content: `<p>` + strings.Repeat("章节正文", 20) + `</p>`, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := chapterContentNeedsDetailFetch(tc.content)
			if got != tc.want {
				t.Fatalf("chapterContentNeedsDetailFetch() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestHjd2048BoardsChannelFeatures(t *testing.T) {
	persist := false
	refresh := true
	limit := 200
	ch := &FeedChannel{
		ID:    "boards",
		Route: "/hjd2048/channels",
		Features: ChannelFeatures{
			Feed: &FeedFeature{Persist: &persist, Refresh: &refresh, Limit: &limit},
			Chapters: &ChaptersFeature{
				Route: "/hjd2048/list",
			},
		},
	}
	f := ResolveFeatures(ch)
	if f.Feed.Persist {
		t.Fatal("boards list should be ephemeral")
	}
	if !f.Feed.Refresh {
		t.Fatal("boards list should allow refresh")
	}
	if !ChannelDynamic(ch) {
		t.Fatal("boards channel should be dynamic")
	}
	cap := GetChannelCapabilities(ch)
	if !cap.CanRefresh || !cap.HasChapters || cap.PersistList {
		t.Fatalf("unexpected capabilities: %+v", cap)
	}
	if !listItemsShouldRefresh(f, 0, 0) {
		t.Fatal("empty boards list should trigger refresh")
	}
}
