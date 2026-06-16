package plugin

import "testing"

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
