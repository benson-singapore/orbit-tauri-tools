package plugin

import "testing"

func TestChannelDynamic(t *testing.T) {
	if ChannelDynamic(nil) {
		t.Fatal("nil channel must not be dynamic")
	}
	if ChannelDynamic(&FeedChannel{Route: "/youtube/user/:username"}) {
		t.Fatal("user channel must not be dynamic")
	}
	if !ChannelDynamic(&FeedChannel{Route: "/youtube/search/:query"}) {
		t.Fatal("search route must be treated as dynamic")
	}
	if !ChannelDynamic(&FeedChannel{Dynamic: true}) {
		t.Fatal("expected dynamic flag")
	}
}

func TestWasmPageFromOffset(t *testing.T) {
	if got := WasmPageFromOffset(20, 0); got != 1 {
		t.Fatalf("page 1 expected, got %d", got)
	}
	if got := WasmPageFromOffset(20, 20); got != 2 {
		t.Fatalf("page 2 expected, got %d", got)
	}
	if got := WasmPageFromOffset(20, 40); got != 3 {
		t.Fatalf("page 3 expected, got %d", got)
	}
	if got := WasmPageFromOffset(0, 40); got != 3 {
		t.Fatalf("page 3 expected with default limit, got %d", got)
	}
}

func TestInferSearchChannelMetadata(t *testing.T) {
	ch := FeedChannel{
		ID:    "search",
		Route: "/youtube/search/:query",
		Params: map[string]string{
			"query": "",
			"page":  "1",
		},
	}
	inferSearchChannelMetadata(&ch)
	if !ch.Dynamic {
		t.Fatal("expected dynamic=true for search route")
	}
	if ch.Type != ChannelTypeSearch {
		t.Fatalf("expected type search, got %q", ch.Type)
	}
}

func TestChannelsForAPI(t *testing.T) {
	out := ChannelsForAPI([]FeedChannel{
		{ID: "user", Route: "/youtube/user/:username"},
		{ID: "search", Route: "/youtube/search/:query"},
		{ID: "off", Route: "/x", Status: ChannelStatusDisabled},
	}, MediaVideo)
	if len(out) != 2 {
		t.Fatalf("expected 2 enabled channels, got %d", len(out))
	}
	var search *FeedChannel
	for i := range out {
		if out[i].ID == "search" {
			search = &out[i]
		}
	}
	if search == nil || !search.Dynamic {
		t.Fatal("search channel must expose dynamic=true in API view")
	}
}

func TestDynamicSearchWasmOverrides(t *testing.T) {
	ch := &FeedChannel{
		Route: "/youtube/search/:query",
		Params: map[string]string{
			"query": "",
			"page":  "1",
		},
	}
	overrides := DynamicSearchWasmOverrides(ch, "沙雕视频", 20, 20)
	if overrides["query"] != "沙雕视频" {
		t.Fatalf("expected query override, got %q", overrides["query"])
	}
	if overrides["page"] != "2" {
		t.Fatalf("expected page=2, got %q", overrides["page"])
	}
}

func TestBuildWasmFetchData_DynamicSearchOverrides(t *testing.T) {
	ch := &FeedChannel{
		Route: "/youtube/search/:query",
		Params: map[string]string{
			"query": "",
			"page":  "1",
		},
	}
	overrides := DynamicSearchWasmOverrides(ch, "test", 20, 40)
	data := buildWasmFetchDataWithParams(nil, ch, overrides)
	if data.Params["query"] != "test" {
		t.Fatalf("expected query=test, got %q", data.Params["query"])
	}
	if data.Params["page"] != "3" {
		t.Fatalf("expected page=3, got %q", data.Params["page"])
	}
}

func TestChannelBrowseDynamic(t *testing.T) {
	if ChannelBrowseDynamic(nil, MediaImage) {
		t.Fatal("nil channel must not be browse dynamic")
	}
	if ChannelBrowseDynamic(&FeedChannel{Dynamic: true, Route: "/1x/:category"}, MediaArticle) {
		t.Fatal("article plugin must not be browse dynamic")
	}
	if !ChannelBrowseDynamic(&FeedChannel{Dynamic: true, Route: "/1x/:category"}, MediaImage) {
		t.Fatal("image plugin with dynamic=true must be browse dynamic")
	}
	if ChannelBrowseDynamic(&FeedChannel{Route: "/1x/:category"}, MediaImage) {
		t.Fatal("image route without explicit dynamic flag must not be browse dynamic")
	}
	if ChannelBrowseDynamic(&FeedChannel{Dynamic: true, Route: "/youtube/search/:query"}, MediaVideo) {
		t.Fatal("video plugin must not be browse dynamic")
	}
}

func TestDynamicImageWasmOverrides(t *testing.T) {
	ch := &FeedChannel{
		Route: "/1x/:category",
		Params: map[string]string{
			"category": "latest/awarded",
			"page":     "1",
			"size":     "20",
		},
		Dynamic: true,
	}
	overrides := DynamicImageWasmOverrides(ch, 20, 0)
	if overrides["page"] != "1" {
		t.Fatalf("expected page=1, got %q", overrides["page"])
	}
	if overrides["size"] != "20" {
		t.Fatalf("expected size=20, got %q", overrides["size"])
	}
	overrides = DynamicImageWasmOverrides(ch, 20, 40)
	if overrides["page"] != "3" {
		t.Fatalf("expected page=3, got %q", overrides["page"])
	}
	if overrides["size"] != "20" {
		t.Fatalf("expected size=20, got %q", overrides["size"])
	}
}

func TestBuildDynamicSearchParams(t *testing.T) {
	ch := &FeedChannel{
		Route: "/youtube/search/:query",
		Params: map[string]string{
			"query": "",
			"page":  "1",
		},
	}
	params := BuildDynamicSearchParams(ch, "2023", 2)
	if params["query"] != "2023" {
		t.Fatalf("expected query=2023, got %q", params["query"])
	}
	if params["page"] != "2" {
		t.Fatalf("expected page=2, got %q", params["page"])
	}
}
