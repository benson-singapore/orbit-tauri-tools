package plugin

import (
	"os"
	"testing"
)

func TestResolveFeaturesDefaults(t *testing.T) {
	ch := &FeedChannel{ID: "home"}
	f := ResolveFeatures(ch)
	if !f.Feed.Persist || !f.Feed.Refresh {
		t.Fatal("expected default persist and refresh true")
	}
	if f.Feed.Limit != DefaultFeedLimit {
		t.Fatalf("expected limit %d, got %d", DefaultFeedLimit, f.Feed.Limit)
	}
}

func TestResolveFeaturesCool18(t *testing.T) {
	persist := true
	refresh := true
	limit := 100
	ch := &FeedChannel{
		ID: "home",
		Features: ChannelFeatures{
			Feed: &FeedFeature{Persist: &persist, Refresh: &refresh, Limit: &limit},
			Pagination: &PaginationFeature{
				Style:   PaginationStyleOffset,
				Param:   "page",
				Default: "1",
			},
			Detail: &DetailFeature{
				Route: "/cool18/detail/:id",
			},
		},
	}
	f := ResolveFeatures(ch)
	if f.Pagination == nil || f.Pagination.Style != PaginationStyleOffset {
		t.Fatal("expected pagination")
	}
	if f.Detail == nil || f.Detail.Route != "/cool18/detail/:id" {
		t.Fatal("expected detail route")
	}
	cap := GetChannelCapabilities(ch)
	if !cap.CanLoadMore || !cap.HasDetail || cap.HasChapters {
		t.Fatalf("unexpected capabilities: %+v", cap)
	}
}

func TestValidateChannelFeaturesMutualExclusion(t *testing.T) {
	ch := FeedChannel{
		ID: "x",
		Features: ChannelFeatures{
			Detail:   &DetailFeature{Route: "/a"},
			Chapters: &ChaptersFeature{Route: "/b"},
		},
	}
	if err := ValidateChannelFeatures(ch); err == nil {
		t.Fatal("expected error for detail+chapters")
	}
}

func TestParamsForRefreshResetsPagination(t *testing.T) {
	ch := &FeedChannel{
		Params: map[string]string{"page": "5", "seenIds": ""},
		Features: ChannelFeatures{
			Pagination: &PaginationFeature{
				Style:       PaginationStyleOffset,
				Param:       "page",
				Default:     "1",
				CarryParams: []string{"seenIds"},
			},
		},
	}
	f := ResolveFeatures(ch)
	params := ParamsForRefresh(ch, f)
	if params["page"] != "1" {
		t.Fatalf("expected page=1, got %q", params["page"])
	}
	if params["seenIds"] != "" {
		t.Fatalf("expected seenIds cleared, got %q", params["seenIds"])
	}
}

func TestParamsForLoadMoreJimengSeenIDs(t *testing.T) {
	ch := &FeedChannel{
		ID:    "trending",
		Route: "/jimeng/explore",
		Params: map[string]string{
			"categoryId": "11222",
			"workType":   "image",
			"page":       "1",
			"seenIds":    "",
		},
		Features: ChannelFeatures{
			Pagination: &PaginationFeature{
				Style:       PaginationStyleOffset,
				Param:       "page",
				Default:     "1",
				CarryParams: []string{"seenIds"},
			},
		},
	}
	features := ResolveFeatures(ch)
	refreshParams := ParamsForRefresh(ch, features)

	firstPage := &FetchResult{
		Next: map[string]string{
			"categoryId": "11222",
			"workType":   "image",
			"page":       "2",
			"seenIds":    "7627090507965009202,7651742291727600906",
		},
	}
	loadMoreParams, err := ParamsForLoadMore(ch, features, refreshParams, firstPage, nil)
	if err != nil {
		t.Fatal(err)
	}
	if loadMoreParams["page"] != "2" {
		t.Fatalf("page = %q, want 2", loadMoreParams["page"])
	}
	if loadMoreParams["seenIds"] != "7627090507965009202,7651742291727600906" {
		t.Fatalf("seenIds = %q", loadMoreParams["seenIds"])
	}

	partialNext := &FetchResult{
		Next: map[string]string{
			"seenIds": "7627090507965009202,7651742291727600906",
		},
	}
	partialParams, err := ParamsForLoadMore(ch, features, refreshParams, partialNext, nil)
	if err != nil {
		t.Fatal(err)
	}
	if partialParams["page"] != "2" {
		t.Fatalf("partial next page = %q, want 2", partialParams["page"])
	}
	if partialParams["seenIds"] != "7627090507965009202,7651742291727600906" {
		t.Fatalf("partial next seenIds = %q", partialParams["seenIds"])
	}
}

func TestIsHomePage(t *testing.T) {
	pag := &PaginationFeature{Style: PaginationStyleOffset, Param: "page", Default: "1"}
	if !IsHomePage(map[string]string{"page": "1"}, pag) {
		t.Fatal("page 1 should be home")
	}
	if IsHomePage(map[string]string{"page": "2"}, pag) {
		t.Fatal("page 2 should not be home")
	}
}

func TestInferPersistedListHasMore(t *testing.T) {
	features := ResolvedFeatures{
		Pagination: &PaginationFeature{Style: PaginationStyleOffset, Param: "page", Default: "1"},
	}
	if !InferPersistedListHasMore(features, nil, 0, 20, 20) {
		t.Fatal("paginated home view should allow load more")
	}
	if !InferPersistedListHasMore(features, nil, 0, 0, 0) {
		t.Fatal("paginated home view should allow load more even when db cache is empty")
	}
	sess := &ChannelSession{HasMore: false}
	if !InferPersistedListHasMore(features, sess, 0, 20, 20) {
		t.Fatal("home view should ignore stale session hasMore and still allow load more")
	}
	if InferPersistedListHasMore(features, sess, 20, 0, 40) {
		t.Fatal("offset view should respect session hasMore=false")
	}
	plain := ResolvedFeatures{}
	if InferPersistedListHasMore(plain, nil, 0, 10, 10) {
		t.Fatal("non-paginated feed at db end should not hasMore")
	}
	if !InferPersistedListHasMore(plain, nil, 0, 10, 30) {
		t.Fatal("non-paginated feed with more rows in db should hasMore")
	}
}

func TestParamsFromClient(t *testing.T) {
	ch := &FeedChannel{
		Params: map[string]string{"category": "latest/awarded", "page": "1", "size": "20"},
	}
	got := ParamsFromClient(ch, map[string]string{"page": "3"})
	if got["category"] != "latest/awarded" || got["page"] != "3" || got["size"] != "20" {
		t.Fatalf("ParamsFromClient = %#v", got)
	}
}

func TestParamsForLoadMore1xOffsetPagination(t *testing.T) {
	ch := &FeedChannel{
		ID:     "latest-awarded",
		Route:  "/1x/:category",
		Params: map[string]string{"category": "latest/awarded", "page": "1", "size": "20"},
		Features: ChannelFeatures{
			Pagination: &PaginationFeature{
				Style:   PaginationStyleOffset,
				Param:   "page",
				Default: "1",
			},
		},
	}
	features := ResolveFeatures(ch)
	refreshParams := ParamsForRefresh(ch, features)

	firstParams, err := ParamsForLoadMore(ch, features, refreshParams, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if firstParams["page"] != "2" || firstParams["size"] != "20" {
		t.Fatalf("first load more = %#v, want page=2 size=20", firstParams)
	}

	partialNext := &FetchResult{
		Next: map[string]string{"category": "latest/awarded"},
	}
	partialParams, err := ParamsForLoadMore(ch, features, refreshParams, partialNext, nil)
	if err != nil {
		t.Fatal(err)
	}
	if partialParams["page"] != "2" {
		t.Fatalf("partial next load more page = %q, want 2", partialParams["page"])
	}

	secondParams, err := ParamsForLoadMore(ch, features, firstParams, &FetchResult{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if secondParams["page"] != "3" {
		t.Fatalf("second load more page = %q, want 3", secondParams["page"])
	}

	thirdParams, err := ParamsForLoadMore(ch, features, secondParams, &FetchResult{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if thirdParams["page"] != "4" {
		t.Fatalf("third load more page = %q, want 4", thirdParams["page"])
	}

	explicitNext, err := ParamsForLoadMore(
		ch,
		features,
		refreshParams,
		&FetchResult{Next: map[string]string{"category": "latest/awarded", "page": "2"}},
		nil,
	)
	if err != nil {
		t.Fatal(err)
	}
	if explicitNext["page"] != "2" {
		t.Fatalf("explicit next page = %q, want 2", explicitNext["page"])
	}
}

func TestMigrate1xLegacyChannel(t *testing.T) {
	ch := FeedChannel{
		ID:        "latest-awarded",
		Route:     "/1x/:category",
		Params:    map[string]string{"category": "latest/awarded", "page": "1", "size": "20"},
		ItemLimit: 100,
		Type:      "search",
		Dynamic:   true,
	}
	if !MigrateChannelV1ToFeatures(&ch, MediaImage) {
		t.Fatal("expected migration")
	}
	if ch.Type != "" || ch.Dynamic || ch.ItemLimit != 0 {
		t.Fatal("legacy fields should be cleared")
	}
	f := ResolveFeatures(&ch)
	if !f.Feed.Persist || !f.Feed.Refresh {
		t.Fatal("expected persisted feed channel")
	}
	if f.Feed.Limit != 100 {
		t.Fatalf("expected limit 100, got %d", f.Feed.Limit)
	}
	if f.Pagination == nil || f.Pagination.Style != PaginationStyleOffset {
		t.Fatal("expected offset pagination")
	}
	if f.Search != nil {
		t.Fatal("1x browse channels should not become search")
	}
	cap := GetChannelCapabilities(&ch)
	if !cap.CanLoadMore || cap.CanSearch {
		t.Fatalf("unexpected capabilities: %+v", cap)
	}
}

func TestMigrateLegacySearchChannel(t *testing.T) {
	ch := FeedChannel{
		ID:        "search",
		Route:     "/youtube/search/:query",
		Params:    map[string]string{"query": "", "page": "1"},
		ItemLimit: 50,
		Type:      "search",
		Dynamic:   true,
	}
	if !MigrateChannelV1ToFeatures(&ch, MediaVideo) {
		t.Fatal("expected migration")
	}
	f := ResolveFeatures(&ch)
	if f.Feed.Persist || f.Feed.Refresh {
		t.Fatal("search channels should be ephemeral")
	}
	if f.Search == nil || f.Search.Param != "query" {
		t.Fatal("expected search feature")
	}
}

func TestParseInstalled1xManifest(t *testing.T) {
	const path = "/Users/benson/Library/Application Support/Orbit Reader/plugins/1x/manifest.json"
	data, err := os.ReadFile(path)
	if err != nil {
		t.Skip(err)
	}
	m, err := ParseManifestBytes(data)
	if err != nil {
		t.Fatal(err)
	}
	if m.ID != "1x" {
		t.Fatalf("unexpected id %q", m.ID)
	}
	for _, ch := range m.Config.Channels {
		if ch.Type != "" || ch.Dynamic || ch.ItemLimit > 0 {
			t.Fatalf("channel %q still has legacy fields", ch.ID)
		}
	}
}

func TestParamsForChaptersLoadMoreCursorPagination(t *testing.T) {
	ch := &FeedChannel{
		ID: "erotic-literature",
		Features: ChannelFeatures{
			Chapters: &ChaptersFeature{
				Route:   "/xbookcn/chapters/:id",
				IDParam: "id",
				Pagination: &PaginationFeature{
					Style:   PaginationStyleCursor,
					Param:   "page",
					Default: "1",
				},
			},
		},
	}
	features := ResolveFeatures(ch)
	parent := FeedItem{
		ID:        "blog:精选作品",
		PluginID:  "xbookcn",
		ChannelID: "erotic-literature",
	}

	firstParams, err := ParamsForChaptersLoadMore(features, parent, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if firstParams["id"] != "blog:精选作品" || firstParams["page"] != "2" {
		t.Fatalf("first load more = %#v, want id=blog:精选作品 page=2", firstParams)
	}

	partialNext := &FetchResult{
		Next: map[string]string{"id": "blog:精选作品"},
	}
	partialParams, err := ParamsForChaptersLoadMore(
		features,
		parent,
		map[string]string{"id": "blog:精选作品", "page": "1"},
		partialNext,
		nil,
	)
	if err != nil {
		t.Fatal(err)
	}
	if partialParams["page"] != "2" {
		t.Fatalf("partial next load more page = %q, want 2", partialParams["page"])
	}

	fullNext := &FetchResult{
		Next: map[string]string{"id": "blog:精选作品", "page": "2"},
	}
	fullParams, err := ParamsForChaptersLoadMore(
		features,
		parent,
		map[string]string{"id": "blog:精选作品", "page": "1"},
		fullNext,
		nil,
	)
	if err != nil {
		t.Fatal(err)
	}
	if fullParams["page"] != "2" {
		t.Fatalf("full next load more page = %q, want 2", fullParams["page"])
	}

	thirdParams, err := ParamsForChaptersLoadMore(
		features,
		parent,
		map[string]string{"id": "blog:精选作品", "page": "2"},
		&FetchResult{},
		nil,
	)
	if err != nil {
		t.Fatal(err)
	}
	if thirdParams["page"] != "3" {
		t.Fatalf("third page load more page = %q, want 3", thirdParams["page"])
	}

	explicitNext, err := ParamsForChaptersLoadMore(
		features,
		parent,
		map[string]string{"id": "blog:精选作品", "page": "1"},
		&FetchResult{Next: map[string]string{"id": "blog:精选作品", "page": "2"}},
		nil,
	)
	if err != nil {
		t.Fatal(err)
	}
	if explicitNext["page"] != "2" {
		t.Fatalf("explicit next page = %q, want 2", explicitNext["page"])
	}
}

func TestParamsForChapterDetailYilin(t *testing.T) {
	ch := &FeedChannel{
		ID: "issues",
		Features: ChannelFeatures{
			Chapters: &ChaptersFeature{
				Detail: &ChapterDetailFeature{
					Route:       "/yilin/detail/:id",
					IDParam:     "id",
					ParentParam: "parentId",
				},
			},
		},
	}
	features := ResolveFeatures(ch)
	parent := FeedItem{
		ID:        "yilin:issues:www.yilinzazhi.com/2025/20258/index.html",
		PluginID:  "yilin",
		ChannelID: "issues",
	}
	chapter := FeedItem{
		ID:        "yilin:issues:www.yilinzazhi.com/2025/20258/index.html:www.yilinzazhi.com/2025/20258/articles/AIxieshilangmandejinhua.html",
		PluginID:  "yilin",
		ChannelID: "issues",
	}
	route, params := ParamsForChapterDetail(features, parent, chapter)
	if route != "/yilin/detail/:id" {
		t.Fatalf("route = %q", route)
	}
	if params["parentId"] != "www.yilinzazhi.com/2025/20258/index.html" {
		t.Fatalf("parentId = %q", params["parentId"])
	}
	if params["id"] != "www.yilinzazhi.com/2025/20258/articles/AIxieshilangmandejinhua.html" {
		t.Fatalf("id = %q", params["id"])
	}
}
