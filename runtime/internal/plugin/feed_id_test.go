package plugin

import (
	"testing"

	"github.com/orbit-tauri-tools/runtime/internal/store"
)

func TestFeedStorageIDRoundTrip(t *testing.T) {
	item := FeedItem{
		ID:       "23",
		PluginID: "hjd2048",
		Title:    "網友自拍",
	}
	row, err := feedItemToRow(item, "boards")
	if err != nil {
		t.Fatal(err)
	}
	if row.ID != "hjd2048:boards:23" {
		t.Fatalf("storage id = %q, want hjd2048:boards:23", row.ID)
	}

	restored := rowToFeedItem(store.FeedItemRow{
		ID:        row.ID,
		PluginID:  "hjd2048",
		ChannelID: "boards",
		Title:     row.Title,
	}, false)
	if restored.ID != "23" {
		t.Fatalf("native id = %q, want 23", restored.ID)
	}
}

func TestMapWasmFeedItemsKeepsNativeID(t *testing.T) {
	rec := &PluginRecord{
		Manifest: Manifest{
			ID:        "hjd2048",
			Name:      "2048核基地",
			MediaType: "article",
		},
	}
	items := mapWasmFeedItems(rec, "boards", wasmFeedResult{
		Items: []wasmFeedItem{{
			ID:    "23",
			Title: "網友自拍",
			URL:   "https://hjd2048.com/2048/thread.php?fid=23",
		}},
	})
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].ID != "23" {
		t.Fatalf("item id = %q, want 23", items[0].ID)
	}
}

func TestParamsForChaptersUsesNativeID(t *testing.T) {
	features := ResolvedFeatures{
		Chapters: &ResolvedChaptersFeature{
			Route:   "/hjd2048/list",
			IDParam: "id",
		},
	}
	item := FeedItem{
		ID:        "23",
		PluginID:  "hjd2048",
		ChannelID: "boards",
	}
	route, params := ParamsForChapters(features, item)
	if route != "/hjd2048/list" {
		t.Fatalf("route = %q", route)
	}
	if params["id"] != "23" {
		t.Fatalf("params[id] = %q, want 23", params["id"])
	}
}
