package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/orbit-tauri-tools/runtime/internal/store"
)

type DispatchResult struct {
	Items   []FeedItem        `json:"items"`
	HasMore bool              `json:"hasMore"`
	Title   string            `json:"title,omitempty"`
	Item    *FeedItem         `json:"item,omitempty"`
	Next    map[string]string `json:"next,omitempty"`
	// Pending is true when an empty list has a background refresh still in flight.
	// Clients should keep polling while Pending is true, then stop when it clears.
	Pending bool `json:"pending,omitempty"`
}

type FeatureDispatcher struct {
	registry *Registry
	sessions *SessionStore
}

func NewFeatureDispatcher(reg *Registry) *FeatureDispatcher {
	return &FeatureDispatcher{
		registry: reg,
		sessions: NewSessionStore(),
	}
}

func (d *FeatureDispatcher) ClearPluginSessions(pluginID string) {
	d.sessions.ClearPlugin(pluginID)
}

func (d *FeatureDispatcher) Capabilities(pluginID, channelID string) (ChannelCapabilities, error) {
	rec, ch, err := d.resolveChannel(pluginID, channelID)
	if err != nil {
		return ChannelCapabilities{}, err
	}
	cap := GetChannelCapabilities(ch)
	pb := ResolvePlayback(&rec.Manifest, ch)
	cap.Playback = &pb
	return cap, nil
}

func (d *FeatureDispatcher) ListItems(ctx context.Context, pluginID, channelID string, limit, offset int) (DispatchResult, error) {
	rec, ch, err := d.resolveChannel(pluginID, channelID)
	if err != nil {
		return DispatchResult{}, err
	}
	features := ResolveFeatures(ch)

	if !features.Feed.Persist {
		sess := d.sessions.Get(pluginID, channelID)
		itemCount := 0
		if sess != nil {
			itemCount = len(sess.Ephemeral)
		}
		if itemCount == 0 {
			if listItemsShouldRefresh(features, offset, itemCount) {
				if d.sessions.BeginAutoListRefresh(pluginID, channelID) {
					if _, err := d.registry.MergePluginVars(ctx, rec); err != nil {
						d.sessions.ResetAutoListRefresh(pluginID, channelID)
						return DispatchResult{}, err
					}
					d.registry.refreshQueue.EnqueueInteractive(pluginID, channelID)
				}
				return DispatchResult{
					Items:   []FeedItem{},
					HasMore: false,
					Pending: d.sessions.ListRefreshPending(pluginID, channelID),
				}, nil
			}
			return DispatchResult{
				Items:   []FeedItem{},
				HasMore: false,
				Pending: d.sessions.ListRefreshPending(pluginID, channelID),
			}, nil
		}
		items := paginateItems(sess.Ephemeral, limit, offset)
		if items == nil {
			items = []FeedItem{}
		}
		out := DispatchResult{Items: items, HasMore: sess.HasMore}
		if sess.LastResponse != nil && len(sess.LastResponse.Next) > 0 {
			out.Next = sess.LastResponse.Next
		}
		return out, nil
	}

	rows, total, err := d.registry.store.ListFeedItemsPaged(ctx, pluginID, channelID, limit, offset)
	if err != nil {
		return DispatchResult{}, err
	}
	if len(rows) == 0 && listItemsShouldRefresh(features, offset, 0) {
		if d.sessions.BeginAutoListRefresh(pluginID, channelID) {
			if _, err := d.registry.MergePluginVars(ctx, rec); err != nil {
				d.sessions.ResetAutoListRefresh(pluginID, channelID)
				return DispatchResult{}, err
			}
			d.registry.refreshQueue.EnqueueInteractive(pluginID, channelID)
		}
		return DispatchResult{
			Items:   []FeedItem{},
			HasMore: false,
			Pending: d.sessions.ListRefreshPending(pluginID, channelID),
		}, nil
	}
	items := make([]FeedItem, 0, len(rows))
	for _, row := range rows {
		item := rowToFeedItem(row, false)
		if item.PluginName == "" {
			item.PluginName = rec.Name
		}
		items = append(items, item)
	}
	sess := d.sessions.Get(pluginID, channelID)
	hasMore := InferPersistedListHasMore(features, sess, offset, len(items), total)
	if offset == 0 && features.Pagination != nil {
		refreshParams := ParamsForRefresh(ch, features)
		d.sessions.ResetFeedPagination(pluginID, channelID, refreshParams, true)
	}
	return DispatchResult{Items: items, HasMore: hasMore}, nil
}

func listItemsShouldRefresh(features ResolvedFeatures, offset, itemCount int) bool {
	return offset == 0 && itemCount == 0 && features.Feed.Refresh
}

func (d *FeatureDispatcher) ListChapters(ctx context.Context, pluginID, channelID, parentItemID string) (DispatchResult, error) {
	rec, ch, err := d.resolveChannel(pluginID, channelID)
	if err != nil {
		return DispatchResult{}, err
	}
	features := ResolveFeatures(ch)
	if features.Chapters == nil || !features.Chapters.Persist {
		return DispatchResult{Items: []FeedItem{}}, nil
	}
	item, _, err := d.loadFeedItemOrStub(ctx, pluginID, channelID, parentItemID)
	if err != nil {
		return DispatchResult{}, err
	}
	items, _, err := d.loadChapterItemsForParent(ctx, rec.ID, ch.ID, item)
	if err != nil {
		return DispatchResult{}, err
	}
	return DispatchResult{Items: items}, nil
}

func (d *FeatureDispatcher) ClearChannelSession(pluginID, channelID string) {
	d.sessions.Clear(pluginID, channelID)
}

func (d *FeatureDispatcher) Refresh(ctx context.Context, pluginID, channelID string) (DispatchResult, error) {
	d.sessions.ResetAutoListRefresh(pluginID, channelID)
	d.sessions.BeginAutoListRefresh(pluginID, channelID)
	result, err := d.dispatch(ctx, pluginID, channelID, TriggerRefresh, dispatchExtra{})
	d.sessions.MarkListRefreshSettled(pluginID, channelID)
	return result, err
}

func (d *FeatureDispatcher) ClearAndRefresh(ctx context.Context, pluginID, channelID string) (DispatchResult, error) {
	rec, ch, err := d.resolveChannel(pluginID, channelID)
	if err != nil {
		return DispatchResult{}, err
	}
	if rec.Source != SourceWASM {
		return DispatchResult{}, fmt.Errorf("v2 runtime requires wasm plugin")
	}
	dir, ok := d.registry.getPluginDir(rec.ID)
	if !ok {
		return DispatchResult{}, fmt.Errorf("plugin dir not found for %s", rec.ID)
	}

	vars, err := d.registry.MergePluginVars(ctx, rec)
	if err != nil {
		return DispatchResult{}, err
	}

	features := ResolveFeatures(ch)

	if err := d.registry.store.DeleteFeedItemsByChannel(ctx, rec.ID, ch.ID); err != nil {
		return DispatchResult{}, err
	}
	d.sessions.Clear(rec.ID, ch.ID)
	d.sessions.BeginAutoListRefresh(pluginID, channelID)
	defer d.sessions.MarkListRefreshSettled(pluginID, channelID)

	params := ParamsForRefresh(ch, features)
	result, err := d.registry.wasmExec.Fetch(ctx, dir, rec, FetchRequest{
		ChannelID: ch.ID,
		Route:     ch.Route,
		Params:    params,
		Vars:      vars,
	})
	if err != nil {
		return DispatchResult{}, err
	}

	hasMore := InferHasMore(result, features)
	d.sessions.SetListResponse(rec.ID, ch.ID, result, hasMore, params)

	if !features.Feed.Persist {
		d.sessions.SetEphemeral(rec.ID, ch.ID, result.Items, hasMore)
		return DispatchResult{Items: result.Items, HasMore: hasMore, Title: result.Title, Next: result.Next}, nil
	}

	now := time.Now().Unix()
	if err := d.persistFeedList(ctx, rec, ch, result.Items, now, features.Feed.Limit, "replace"); err != nil {
		return DispatchResult{}, err
	}

	items, _, err := d.registry.loadFeedItems(ctx, pluginID, channelID, "")
	if err != nil {
		return DispatchResult{}, err
	}
	return DispatchResult{Items: items, HasMore: hasMore, Title: result.Title}, nil
}

func (d *FeatureDispatcher) LoadMore(
	ctx context.Context,
	pluginID, channelID string,
	clientParams map[string]string,
) (DispatchResult, error) {
	return d.dispatch(ctx, pluginID, channelID, TriggerLoadMore, dispatchExtra{Params: clientParams})
}

func (d *FeatureDispatcher) Search(ctx context.Context, pluginID, channelID, query string) (DispatchResult, error) {
	return d.dispatch(ctx, pluginID, channelID, TriggerSearch, dispatchExtra{Query: query})
}

func (d *FeatureDispatcher) OpenDetail(
	ctx context.Context,
	pluginID, channelID, itemID string,
	forceRefresh bool,
) (DispatchResult, error) {
	item, inStore, err := d.loadFeedItemOrStub(ctx, pluginID, channelID, itemID)
	if err != nil {
		return DispatchResult{}, err
	}
	return d.dispatch(ctx, pluginID, channelID, TriggerOpenDetail, dispatchExtra{
		Item:         item,
		ItemInStore:  inStore,
		ForceRefresh: forceRefresh,
	})
}

func (d *FeatureDispatcher) OpenChapters(ctx context.Context, pluginID, channelID, itemID string) (DispatchResult, error) {
	item, _, err := d.loadFeedItemOrStub(ctx, pluginID, channelID, itemID)
	if err != nil {
		return DispatchResult{}, err
	}
	return d.dispatch(ctx, pluginID, channelID, TriggerOpenChapters, dispatchExtra{Item: item})
}

func (d *FeatureDispatcher) LoadMoreChapters(ctx context.Context, pluginID, channelID, parentItemID string) (DispatchResult, error) {
	parentItem, _, err := d.loadFeedItemOrStub(ctx, pluginID, channelID, parentItemID)
	if err != nil {
		return DispatchResult{}, err
	}
	return d.dispatch(ctx, pluginID, channelID, TriggerLoadMoreChapters, dispatchExtra{Item: parentItem})
}

func (d *FeatureDispatcher) RefreshChapters(ctx context.Context, pluginID, channelID, parentItemID string) (DispatchResult, error) {
	parentItem, _, err := d.loadFeedItemOrStub(ctx, pluginID, channelID, parentItemID)
	if err != nil {
		return DispatchResult{}, err
	}
	return d.dispatch(ctx, pluginID, channelID, TriggerRefreshChapters, dispatchExtra{Item: parentItem})
}

func (d *FeatureDispatcher) ClearAndRefreshChapters(ctx context.Context, pluginID, channelID, parentItemID string) (DispatchResult, error) {
	parentItem, _, err := d.loadFeedItemOrStub(ctx, pluginID, channelID, parentItemID)
	if err != nil {
		return DispatchResult{}, err
	}
	return d.dispatch(ctx, pluginID, channelID, TriggerClearRefreshChapters, dispatchExtra{Item: parentItem})
}

func (d *FeatureDispatcher) OpenChapterDetail(ctx context.Context, pluginID, channelID, parentItemID, chapterItemID string) (DispatchResult, error) {
	parentItem, _, err := d.loadFeedItemOrStub(ctx, pluginID, channelID, parentItemID)
	if err != nil {
		return DispatchResult{}, err
	}
	chapterItem, err := d.loadChapterItem(ctx, pluginID, channelID, parentItemID, chapterItemID)
	if err != nil {
		return DispatchResult{}, err
	}
	return d.dispatch(ctx, pluginID, channelID, TriggerOpenChapterDetail, dispatchExtra{
		ParentItem:  parentItem,
		ChapterItem: chapterItem,
	})
}

func (d *FeatureDispatcher) ScheduledRefresh(ctx context.Context, pluginID, channelID string) error {
	_, err := d.dispatch(ctx, pluginID, channelID, TriggerScheduled, dispatchExtra{})
	d.sessions.MarkListRefreshSettled(pluginID, channelID)
	return err
}

type dispatchExtra struct {
	Query        string
	Params       map[string]string
	Item         FeedItem
	ItemInStore  bool
	ForceRefresh bool
	ParentItem   FeedItem
	ChapterItem  FeedItem
}

func (d *FeatureDispatcher) dispatch(
	ctx context.Context,
	pluginID, channelID string,
	trigger Trigger,
	extra dispatchExtra,
) (DispatchResult, error) {
	rec, ch, err := d.resolveChannel(pluginID, channelID)
	if err != nil {
		return DispatchResult{}, err
	}
	if rec.Source != SourceWASM {
		return DispatchResult{}, fmt.Errorf("v2 runtime requires wasm plugin")
	}
	dir, ok := d.registry.getPluginDir(rec.ID)
	if !ok {
		return DispatchResult{}, fmt.Errorf("plugin dir not found for %s", rec.ID)
	}

	vars, err := d.registry.MergePluginVars(ctx, rec)
	if err != nil {
		return DispatchResult{}, err
	}

	features := ResolveFeatures(ch)

	switch trigger {
	case TriggerOpenDetail:
		return d.handleOpenDetail(ctx, rec, ch, features, dir, vars, extra.Item, extra.ItemInStore, extra.ForceRefresh)
	case TriggerOpenChapters:
		return d.handleOpenChapters(ctx, rec, ch, features, dir, vars, extra.Item)
	case TriggerLoadMoreChapters:
		return d.handleLoadMoreChapters(ctx, rec, ch, features, dir, vars, extra.Item)
	case TriggerOpenChapterDetail:
		return d.handleOpenChapterDetail(ctx, rec, ch, features, dir, vars, extra.ParentItem, extra.ChapterItem)
	case TriggerRefreshChapters:
		return d.handleRefreshChapters(ctx, rec, ch, features, dir, vars, extra.Item)
	case TriggerClearRefreshChapters:
		return d.handleClearAndRefreshChapters(ctx, rec, ch, features, dir, vars, extra.Item)
	}

	var route string
	var params map[string]string
	switch trigger {
	case TriggerScheduled, TriggerRefresh:
		params = ParamsForRefresh(ch, features)
		route = ch.Route
	case TriggerLoadMore:
		if len(extra.Params) > 0 {
			params = ParamsFromClient(ch, extra.Params)
			route = ch.Route
			break
		}
		sess := d.sessions.Get(pluginID, channelID)
		var lastResp *FetchResult
		var lastParams map[string]string
		if sess != nil {
			lastResp = sess.LastResponse
			lastParams = sess.LastParams
		}
		dbItems, _, err := d.registry.loadFeedItems(ctx, pluginID, channelID, "")
		if err != nil {
			return DispatchResult{}, err
		}
		params, err = ParamsForLoadMore(ch, features, lastParams, lastResp, dbItems)
		if err != nil {
			return DispatchResult{}, err
		}
		route = ch.Route
	case TriggerSearch:
		if features.Search != nil && boolVal(features.Search.Required, true) && strings.TrimSpace(extra.Query) == "" {
			return DispatchResult{}, fmt.Errorf("search query is required")
		}
		params = ParamsForSearch(ch, features, extra.Query)
		route = ch.Route
	default:
		return DispatchResult{}, fmt.Errorf("unsupported trigger %q", trigger)
	}

	result, err := d.registry.wasmExec.Fetch(ctx, dir, rec, FetchRequest{
		ChannelID: ch.ID,
		Route:     route,
		Params:    params,
		Vars:      vars,
	})
	if err != nil {
		return DispatchResult{}, err
	}

	hasMore := InferHasMore(result, features)
	d.sessions.SetListResponse(pluginID, channelID, result, hasMore, params)

	if trigger == TriggerLoadMore {
		items := result.Items
		if !features.Feed.Persist {
			d.sessions.AppendEphemeral(pluginID, channelID, items, hasMore)
		} else {
			count, err := d.registry.store.CountFeedItemsForChannel(ctx, rec.ID, ch.ID)
			if err != nil {
				return DispatchResult{}, err
			}
			if count+len(items) <= features.Feed.Limit {
				now := time.Now().Unix()
				if err := d.persistFeedList(ctx, rec, ch, items, now, features.Feed.Limit, "append"); err != nil {
					return DispatchResult{}, err
				}
			}
		}
		return DispatchResult{
			Items: items, HasMore: hasMore, Title: result.Title, Next: result.Next,
		}, nil
	}

	if !features.Feed.Persist {
		d.sessions.SetEphemeral(pluginID, channelID, result.Items, hasMore)
		return DispatchResult{Items: result.Items, HasMore: hasMore, Title: result.Title, Next: result.Next}, nil
	}

	now := time.Now().Unix()
	if err := d.persistFeedList(ctx, rec, ch, result.Items, now, features.Feed.Limit, "incremental"); err != nil {
		return DispatchResult{}, err
	}

	items, _, err := d.registry.loadFeedItems(ctx, pluginID, channelID, "")
	if err != nil {
		return DispatchResult{}, err
	}
	return DispatchResult{Items: items, HasMore: hasMore, Title: result.Title}, nil
}

func (d *FeatureDispatcher) handleOpenDetail(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	features ResolvedFeatures,
	dir string,
	vars map[string]string,
	item FeedItem,
	itemInStore bool,
	forceRefresh bool,
) (DispatchResult, error) {
	if features.Detail == nil {
		return DispatchResult{}, fmt.Errorf("channel has no detail feature")
	}
	if !forceRefresh && strings.TrimSpace(item.Content) != "" {
		return DispatchResult{Item: &item}, nil
	}
	route, params := ParamsForDetail(features, item)
	result, err := d.registry.wasmExec.Fetch(ctx, dir, rec, FetchRequest{
		ChannelID: ch.ID,
		Route:     route,
		Params:    params,
		Vars:      vars,
	})
	if err != nil {
		return DispatchResult{}, err
	}
	if len(result.Items) == 0 {
		return DispatchResult{Item: &item}, nil
	}
	fetched := result.Items[0]
	merged := mergeFeedItemDetail(item, fetched)
	if itemInStore && features.Detail.Persist {
		if err := d.registry.upsertFeedItem(ctx, merged, ch.ID); err != nil {
			return DispatchResult{}, err
		}
	}
	return DispatchResult{Item: &merged, Title: result.Title}, nil
}

func (d *FeatureDispatcher) handleOpenChapters(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	features ResolvedFeatures,
	dir string,
	vars map[string]string,
	item FeedItem,
) (DispatchResult, error) {
	if features.Chapters == nil {
		return DispatchResult{}, fmt.Errorf("channel has no chapters feature")
	}
	if features.Chapters.Persist {
		return d.handleOpenChaptersPersisted(ctx, rec, ch, features, dir, vars, item)
	}
	return d.handleOpenChaptersEphemeral(ctx, rec, ch, features, dir, vars, item)
}

func (d *FeatureDispatcher) handleOpenChaptersEphemeral(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	features ResolvedFeatures,
	dir string,
	vars map[string]string,
	item FeedItem,
) (DispatchResult, error) {
	parentID := chapterParentID(item)
	_, initParams := ParamsForChapters(features, item)
	hasMoreDefault := features.Chapters.Pagination != nil
	pageSize := chapterPageSize(features)
	if d.sessions.GetChapter(rec.ID, ch.ID, parentID) == nil {
		d.sessions.ResetChapterPagination(rec.ID, ch.ID, parentID, initParams, hasMoreDefault)
	} else {
		d.sessions.ResetChapterDisplay(rec.ID, ch.ID, parentID)
	}
	sess := d.sessions.GetChapter(rec.ID, ch.ID, parentID)

	if sess != nil && len(sess.Ephemeral) > 0 {
		cached := sess.Ephemeral
		if pageSize == 0 {
			title := features.Chapters.Label
			if sess.LastResponse != nil && sess.LastResponse.Title != "" {
				title = sess.LastResponse.Title
			}
			return DispatchResult{Items: cached, HasMore: sess.HasMore, Title: title}, nil
		}
		page := chapterPageItems(cached, pageSize, 0)
		d.sessions.SetChapterLoadedCount(rec.ID, ch.ID, parentID, len(page))
		title := features.Chapters.Label
		if sess.LastResponse != nil && sess.LastResponse.Title != "" {
			title = sess.LastResponse.Title
		}
		return DispatchResult{
			Items:   page,
			HasMore: chapterListHasMore(len(page), len(cached), sess.HasMore),
			Title:   title,
		}, nil
	}

	route, params := ParamsForChapters(features, item)
	result, err := d.registry.wasmExec.Fetch(ctx, dir, rec, FetchRequest{
		ChannelID: ch.ID,
		Route:     route,
		Params:    params,
		Vars:      vars,
	})
	if err != nil {
		return DispatchResult{}, err
	}
	apiHasMore := InferChaptersHasMore(result, features)
	d.sessions.SetChapterListResponse(rec.ID, ch.ID, parentID, result, apiHasMore, params)
	d.sessions.SetChapterEphemeral(rec.ID, ch.ID, parentID, result.Items, apiHasMore)
	items := result.Items
	if pageSize > 0 {
		items = chapterPageItems(result.Items, pageSize, 0)
		d.sessions.SetChapterLoadedCount(rec.ID, ch.ID, parentID, len(items))
	}
	title := result.Title
	if title == "" {
		title = features.Chapters.Label
	}
	return DispatchResult{
		Items:   items,
		HasMore: chapterListHasMore(len(items), len(result.Items), apiHasMore),
		Title:   title,
	}, nil
}

func (d *FeatureDispatcher) handleOpenChaptersPersisted(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	features ResolvedFeatures,
	dir string,
	vars map[string]string,
	item FeedItem,
) (DispatchResult, error) {
	parentID := resolveChapterParentID(rec.ID, ch.ID, item)
	pageSize := chapterPageSize(features)
	limit := features.Chapters.Limit

	d.sessions.ResetChapterDisplay(rec.ID, ch.ID, parentID)

	dbItems, cachedParentID, err := d.loadChapterItemsForParent(ctx, rec.ID, ch.ID, item)
	if err != nil {
		return DispatchResult{}, err
	}
	if cachedParentID != "" {
		parentID = cachedParentID
	}

	if len(dbItems) > 0 {
		items := dbItems
		if pageSize > 0 {
			items = chapterPageItems(dbItems, pageSize, 0)
		}
		d.sessions.SetChapterLoadedCount(rec.ID, ch.ID, parentID, len(items))
		apiMayHaveMore := features.Chapters.Pagination != nil && (limit <= 0 || len(dbItems) < limit)
		return DispatchResult{
			Items:   items,
			HasMore: chapterListHasMore(len(items), len(dbItems), apiMayHaveMore),
			Title:   features.Chapters.Label,
		}, nil
	}

	route, params := ParamsForChapters(features, item)
	result, err := d.registry.wasmExec.Fetch(ctx, dir, rec, FetchRequest{
		ChannelID: ch.ID,
		Route:     route,
		Params:    params,
		Vars:      vars,
	})
	if err != nil {
		return DispatchResult{}, err
	}
	apiHasMore := InferChaptersHasMore(result, features)
	d.sessions.SetChapterListResponse(rec.ID, ch.ID, parentID, result, apiHasMore, params)

	now := time.Now().Unix()
	toCache := result.Items
	if limit > 0 && len(toCache) > limit {
		toCache = toCache[:limit]
	}
	if err := d.persistChapterList(ctx, rec, ch, parentID, toCache, now, limit, "replace"); err != nil {
		return DispatchResult{}, err
	}

	items := result.Items
	if pageSize > 0 {
		items = chapterPageItems(result.Items, pageSize, 0)
	}
	d.sessions.SetChapterLoadedCount(rec.ID, ch.ID, parentID, len(items))
	title := result.Title
	if title == "" {
		title = features.Chapters.Label
	}
	return DispatchResult{
		Items:   items,
		HasMore: chapterListHasMore(len(items), len(result.Items), apiHasMore),
		Title:   title,
	}, nil
}

func (d *FeatureDispatcher) handleLoadMoreChapters(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	features ResolvedFeatures,
	dir string,
	vars map[string]string,
	parentItem FeedItem,
) (DispatchResult, error) {
	if features.Chapters == nil || features.Chapters.Pagination == nil {
		return DispatchResult{}, fmt.Errorf("channel has no chapters pagination")
	}
	if features.Chapters.Persist {
		return d.handleLoadMoreChaptersPersisted(ctx, rec, ch, features, dir, vars, parentItem)
	}
	return d.handleLoadMoreChaptersEphemeral(ctx, rec, ch, features, dir, vars, parentItem)
}

func (d *FeatureDispatcher) handleLoadMoreChaptersEphemeral(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	features ResolvedFeatures,
	dir string,
	vars map[string]string,
	parentItem FeedItem,
) (DispatchResult, error) {
	parentID := chapterParentID(parentItem)
	pageSize := chapterPageSize(features)
	sess := d.sessions.GetChapter(rec.ID, ch.ID, parentID)
	loadedCount := 0
	apiHasMore := true
	if sess != nil {
		loadedCount = sess.LoadedCount
		apiHasMore = sess.HasMore
	}

	var cached []FeedItem
	if sess != nil {
		cached = sess.Ephemeral
	}

	if loadedCount < len(cached) {
		page := chapterPageItems(cached, pageSize, loadedCount)
		newLoaded := loadedCount + len(page)
		d.sessions.SetChapterLoadedCount(rec.ID, ch.ID, parentID, newLoaded)
		title := features.Chapters.Label
		if sess != nil && sess.LastResponse != nil && sess.LastResponse.Title != "" {
			title = sess.LastResponse.Title
		}
		return DispatchResult{
			Items:   page,
			HasMore: chapterListHasMore(newLoaded, len(cached), apiHasMore),
			Title:   title,
		}, nil
	}

	if !apiHasMore {
		return DispatchResult{Items: []FeedItem{}, HasMore: false}, nil
	}

	var lastResp *FetchResult
	var lastParams map[string]string
	if sess != nil {
		lastResp = sess.LastResponse
		lastParams = sess.LastParams
	}
	params, err := ParamsForChaptersLoadMore(features, parentItem, lastParams, lastResp, cached)
	if err != nil {
		return DispatchResult{}, err
	}
	result, err := d.registry.wasmExec.Fetch(ctx, dir, rec, FetchRequest{
		ChannelID: ch.ID,
		Route:     features.Chapters.Route,
		Params:    params,
		Vars:      vars,
	})
	if err != nil {
		return DispatchResult{}, err
	}
	apiHasMore = InferChaptersHasMore(result, features)
	d.sessions.SetChapterListResponse(rec.ID, ch.ID, parentID, result, apiHasMore, params)
	page := trimChapterPage(result.Items, pageSize)
	d.sessions.AppendChapterEphemeral(rec.ID, ch.ID, parentID, result.Items, apiHasMore)
	if sess = d.sessions.GetChapter(rec.ID, ch.ID, parentID); sess != nil {
		cached = sess.Ephemeral
	}
	newLoaded := loadedCount + len(page)
	d.sessions.SetChapterLoadedCount(rec.ID, ch.ID, parentID, newLoaded)
	title := result.Title
	if title == "" {
		title = features.Chapters.Label
	}
	return DispatchResult{
		Items:   page,
		HasMore: chapterListHasMore(newLoaded, len(cached), apiHasMore),
		Title:   title,
	}, nil
}

func (d *FeatureDispatcher) handleLoadMoreChaptersPersisted(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	features ResolvedFeatures,
	dir string,
	vars map[string]string,
	parentItem FeedItem,
) (DispatchResult, error) {
	parentID := resolveChapterParentID(rec.ID, ch.ID, parentItem)
	pageSize := chapterPageSize(features)
	limit := features.Chapters.Limit

	sess := d.sessions.GetChapter(rec.ID, ch.ID, parentID)
	loadedCount := 0
	apiHasMore := true
	if sess != nil {
		loadedCount = sess.LoadedCount
		apiHasMore = sess.HasMore
	}

	dbItems, cachedParentID, err := d.loadChapterItemsForParent(ctx, rec.ID, ch.ID, parentItem)
	if err != nil {
		return DispatchResult{}, err
	}
	if cachedParentID != "" {
		parentID = cachedParentID
	}

	if loadedCount < len(dbItems) {
		page := chapterPageItems(dbItems, pageSize, loadedCount)
		newLoaded := loadedCount + len(page)
		d.sessions.SetChapterLoadedCount(rec.ID, ch.ID, parentID, newLoaded)
		apiMayHaveMore := limit <= 0 || len(dbItems) < limit
		return DispatchResult{
			Items:   page,
			HasMore: chapterListHasMore(newLoaded, len(dbItems), apiMayHaveMore && apiHasMore),
			Title:   features.Chapters.Label,
		}, nil
	}

	if limit > 0 && len(dbItems) >= limit {
		return DispatchResult{Items: []FeedItem{}, HasMore: false}, nil
	}
	if !apiHasMore {
		return DispatchResult{Items: []FeedItem{}, HasMore: false}, nil
	}

	var lastResp *FetchResult
	var lastParams map[string]string
	if sess != nil {
		lastResp = sess.LastResponse
		lastParams = sess.LastParams
	}
	params, err := ParamsForChaptersLoadMore(features, parentItem, lastParams, lastResp, dbItems)
	if err != nil {
		return DispatchResult{}, err
	}
	result, err := d.registry.wasmExec.Fetch(ctx, dir, rec, FetchRequest{
		ChannelID: ch.ID,
		Route:     features.Chapters.Route,
		Params:    params,
		Vars:      vars,
	})
	if err != nil {
		return DispatchResult{}, err
	}
	apiHasMore = InferChaptersHasMore(result, features)
	d.sessions.SetChapterListResponse(rec.ID, ch.ID, parentID, result, apiHasMore, params)

	toCache := result.Items
	if limit > 0 {
		room := limit - len(dbItems)
		if room <= 0 {
			toCache = nil
		} else if len(toCache) > room {
			toCache = toCache[:room]
		}
	}
	if len(toCache) > 0 {
		now := time.Now().Unix()
		if err := d.persistChapterList(ctx, rec, ch, parentID, toCache, now, limit, "append"); err != nil {
			return DispatchResult{}, err
		}
	}

	page := trimChapterPage(result.Items, pageSize)
	newLoaded := loadedCount + len(page)
	d.sessions.SetChapterLoadedCount(rec.ID, ch.ID, parentID, newLoaded)
	title := result.Title
	if title == "" {
		title = features.Chapters.Label
	}
	cachedTotal := len(dbItems) + len(toCache)
	return DispatchResult{
		Items:   page,
		HasMore: chapterListHasMore(newLoaded, cachedTotal, apiHasMore && (limit <= 0 || cachedTotal < limit)),
		Title:   title,
	}, nil
}

func (d *FeatureDispatcher) handleRefreshChapters(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	features ResolvedFeatures,
	dir string,
	vars map[string]string,
	item FeedItem,
) (DispatchResult, error) {
	if features.Chapters == nil {
		return DispatchResult{}, fmt.Errorf("channel has no chapters feature")
	}
	parentID := resolveChapterParentID(rec.ID, ch.ID, item)
	pageSize := chapterPageSize(features)
	limit := features.Chapters.Limit

	route, params := ParamsForChaptersRefresh(features, item)
	result, err := d.registry.wasmExec.Fetch(ctx, dir, rec, FetchRequest{
		ChannelID: ch.ID,
		Route:     route,
		Params:    params,
		Vars:      vars,
	})
	if err != nil {
		return DispatchResult{}, err
	}
	apiHasMore := InferChaptersHasMore(result, features)

	existing, _, err := d.loadChapterItemsForParent(ctx, rec.ID, ch.ID, item)
	if err != nil {
		return DispatchResult{}, err
	}
	merged := mergeChapterListsForRefresh(result.Items, existing)
	if limit > 0 && len(merged) > limit {
		merged = merged[:limit]
	}

	now := time.Now().Unix()
	if err := d.persistChapterList(ctx, rec, ch, parentID, merged, now, limit, "replace"); err != nil {
		return DispatchResult{}, err
	}

	d.sessions.ClearChapter(rec.ID, ch.ID, parentID)
	d.sessions.SetChapterListResponse(rec.ID, ch.ID, parentID, result, apiHasMore, params)

	items := merged
	if pageSize > 0 {
		items = chapterPageItems(merged, pageSize, 0)
	}
	d.sessions.SetChapterLoadedCount(rec.ID, ch.ID, parentID, len(items))
	title := result.Title
	if title == "" {
		title = features.Chapters.Label
	}
	apiMayHaveMore := features.Chapters.Pagination != nil && (limit <= 0 || len(merged) < limit)
	return DispatchResult{
		Items:   items,
		HasMore: chapterListHasMore(len(items), len(merged), apiMayHaveMore && apiHasMore),
		Title:   title,
	}, nil
}

func (d *FeatureDispatcher) handleClearAndRefreshChapters(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	features ResolvedFeatures,
	dir string,
	vars map[string]string,
	item FeedItem,
) (DispatchResult, error) {
	if features.Chapters == nil {
		return DispatchResult{}, fmt.Errorf("channel has no chapters feature")
	}
	parentID := resolveChapterParentID(rec.ID, ch.ID, item)
	pageSize := chapterPageSize(features)
	limit := features.Chapters.Limit

	if err := d.registry.store.DeleteChapterItemsByParent(ctx, rec.ID, ch.ID, parentID); err != nil {
		return DispatchResult{}, err
	}
	d.sessions.ClearChapter(rec.ID, ch.ID, parentID)

	route, params := ParamsForChaptersRefresh(features, item)
	result, err := d.registry.wasmExec.Fetch(ctx, dir, rec, FetchRequest{
		ChannelID: ch.ID,
		Route:     route,
		Params:    params,
		Vars:      vars,
	})
	if err != nil {
		return DispatchResult{}, err
	}
	apiHasMore := InferChaptersHasMore(result, features)
	d.sessions.SetChapterListResponse(rec.ID, ch.ID, parentID, result, apiHasMore, params)

	toCache := result.Items
	if limit > 0 && len(toCache) > limit {
		toCache = toCache[:limit]
	}
	now := time.Now().Unix()
	if err := d.persistChapterList(ctx, rec, ch, parentID, toCache, now, limit, "replace"); err != nil {
		return DispatchResult{}, err
	}

	items := result.Items
	if pageSize > 0 {
		items = chapterPageItems(result.Items, pageSize, 0)
	}
	d.sessions.SetChapterLoadedCount(rec.ID, ch.ID, parentID, len(items))
	title := result.Title
	if title == "" {
		title = features.Chapters.Label
	}
	return DispatchResult{
		Items:   items,
		HasMore: chapterListHasMore(len(items), len(result.Items), apiHasMore),
		Title:   title,
	}, nil
}

func (d *FeatureDispatcher) loadChapterItemsFromStore(ctx context.Context, pluginID, channelID, parentID string) ([]FeedItem, error) {
	rows, err := d.registry.store.ListChapterItems(ctx, pluginID, channelID, parentID)
	if err != nil {
		return nil, err
	}
	items := make([]FeedItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, chapterRowToFeedItem(row, false))
	}
	return items, nil
}

func (d *FeatureDispatcher) loadChapterItemsForParent(
	ctx context.Context,
	pluginID, channelID string,
	item FeedItem,
) ([]FeedItem, string, error) {
	for _, parentID := range chapterParentIDCandidates(pluginID, channelID, item) {
		items, err := d.loadChapterItemsFromStore(ctx, pluginID, channelID, parentID)
		if err != nil {
			return nil, "", err
		}
		if len(items) > 0 {
			return items, parentID, nil
		}
	}
	return nil, resolveChapterParentID(pluginID, channelID, item), nil
}

func (d *FeatureDispatcher) loadChapterListResult(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	parentID, fetchedTitle, defaultTitle string,
) ([]FeedItem, string, error) {
	rows, err := d.registry.store.ListChapterItems(ctx, rec.ID, ch.ID, parentID)
	if err != nil {
		return nil, "", err
	}
	items := make([]FeedItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, chapterRowToFeedItem(row, false))
	}
	title := fetchedTitle
	if title == "" {
		title = defaultTitle
	}
	return items, title, nil
}

// chapterContentNeedsDetailFetch reports whether cached chapter HTML is only a
// list/meta shell (e.g. "共 10 张 · 打开原网页") and the detail route should run.
func chapterContentNeedsDetailFetch(content string) bool {
	c := strings.TrimSpace(content)
	if c == "" {
		return true
	}
	if strings.HasPrefix(c, "[") {
		return false
	}
	lower := strings.ToLower(c)
	if strings.Contains(lower, "<img") || strings.Contains(lower, "comic-reader") {
		return false
	}
	compact := strings.Join(strings.Fields(c), "")
	if strings.Contains(compact, "打开原网页") {
		return true
	}
	if strings.Contains(compact, "共") && strings.Contains(compact, "张") {
		return true
	}
	return false
}

func (d *FeatureDispatcher) handleOpenChapterDetail(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	features ResolvedFeatures,
	dir string,
	vars map[string]string,
	parentItem, chapterItem FeedItem,
) (DispatchResult, error) {
	if features.Chapters == nil || features.Chapters.Detail == nil {
		return DispatchResult{}, fmt.Errorf("channel has no chapter detail feature")
	}
	if !chapterContentNeedsDetailFetch(chapterItem.Content) {
		return DispatchResult{Item: &chapterItem}, nil
	}
	route, params := ParamsForChapterDetail(features, parentItem, chapterItem)
	result, err := d.registry.wasmExec.Fetch(ctx, dir, rec, FetchRequest{
		ChannelID: ch.ID,
		Route:     route,
		Params:    params,
		Vars:      vars,
	})
	if err != nil {
		return DispatchResult{}, err
	}
	if len(result.Items) == 0 {
		return DispatchResult{Item: &chapterItem}, nil
	}
	fetched := result.Items[0]
	merged := mergeFeedItemDetail(chapterItem, fetched)
	if features.Chapters.Detail.Persist {
		parentID := resolveChapterParentID(rec.ID, ch.ID, parentItem)
		if err := d.upsertChapterItemDetail(ctx, merged, rec.ID, ch.ID, parentID); err != nil {
			return DispatchResult{}, err
		}
	}
	return DispatchResult{Item: &merged, Title: result.Title}, nil
}

func (d *FeatureDispatcher) persistFeedList(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	items []FeedItem,
	fetchedAt int64,
	limit int,
	mode string,
) error {
	if mode == "append" {
		items = stampFeedItemsAsOlderPages(items, fetchedAt)
	}
	d.registry.preserveExistingArticleContent(ctx, items)
	rows := make([]store.FeedItemRow, 0, len(items))
	for _, item := range items {
		row, err := feedItemToRow(item, ch.ID)
		if err != nil {
			return err
		}
		rows = append(rows, row)
	}
	var err error
	switch mode {
	case "incremental":
		_, err = d.registry.store.InsertFeedItemsIgnore(ctx, rec.ID, ch.ID, rows, fetchedAt)
	case "append":
		_, err = d.registry.store.InsertFeedItemsIgnore(ctx, rec.ID, ch.ID, rows, fetchedAt)
	default:
		err = d.registry.store.UpsertFeedItemsForChannel(ctx, rec.ID, ch.ID, rows, fetchedAt)
	}
	if err != nil {
		return err
	}
	return d.registry.store.TrimFeedItemsForChannel(ctx, rec.ID, ch.ID, limit)
}

func stampFeedItemsAsOlderPages(items []FeedItem, fetchedAt int64) []FeedItem {
	if len(items) == 0 {
		return items
	}
	out := make([]FeedItem, len(items))
	copy(out, items)
	for i := range out {
		if out[i].PublishedAt > 0 {
			continue
		}
		// Paginated pages are older than refresh data; keep them at the tail when sorted DESC.
		out[i].PublishedAt = fetchedAt - int64(len(items)-i) - 1
	}
	return out
}

func (d *FeatureDispatcher) persistChapterList(
	ctx context.Context,
	rec *PluginRecord,
	ch *FeedChannel,
	parentID string,
	items []FeedItem,
	fetchedAt int64,
	limit int,
	mode string,
) error {
	// Chapter list payloads often include partial HTML (title / "共 N 张" cards).
	// That must not overwrite previously fetched detail bodies, and must not
	// short-circuit openChapterDetail on the next click.
	for i := range items {
		items[i].Content = ""
	}
	d.preserveExistingChapterContent(ctx, items, rec.ID, ch.ID, parentID)
	startOrder := 0
	if mode == "append" || mode == "incremental" {
		maxOrder, err := d.registry.store.MaxChapterItemSortOrder(ctx, rec.ID, ch.ID, parentID)
		if err != nil {
			return err
		}
		startOrder = maxOrder + 1
	}
	rows := make([]store.ChapterItemRow, 0, len(items))
	for i, item := range items {
		row, err := chapterItemToRow(item, rec.ID, ch.ID, parentID, startOrder+i)
		if err != nil {
			return err
		}
		rows = append(rows, row)
	}
	var err error
	switch mode {
	case "incremental", "append":
		err = d.registry.store.InsertChapterItemsIgnore(ctx, rec.ID, ch.ID, parentID, rows, fetchedAt)
	default:
		err = d.registry.store.UpsertChapterItems(ctx, rec.ID, ch.ID, parentID, rows, fetchedAt)
	}
	if err != nil {
		return err
	}
	return d.registry.store.TrimChapterItemsForParent(ctx, rec.ID, ch.ID, parentID, limit)
}

func (d *FeatureDispatcher) preserveExistingChapterContent(
	ctx context.Context,
	items []FeedItem,
	pluginID, channelID, parentID string,
) {
	for i := range items {
		if strings.TrimSpace(items[i].Content) != "" {
			continue
		}
		rawID := extractThirdPartyFeedID(items[i])
		if rawID == "" {
			rawID = items[i].ID
		}
		id := ChapterFullID(pluginID, channelID, parentID, nativeChapterID(parentID, rawID))
		existing, err := d.registry.store.GetChapterItem(ctx, id)
		if err != nil {
			continue
		}
		if existing.PayloadJSON == "" {
			continue
		}
		var payload struct {
			Content string `json:"content"`
		}
		if err := json.Unmarshal([]byte(existing.PayloadJSON), &payload); err != nil {
			continue
		}
		if strings.TrimSpace(payload.Content) != "" {
			items[i].Content = payload.Content
		}
	}
}

func (d *FeatureDispatcher) upsertChapterItemDetail(
	ctx context.Context,
	item FeedItem,
	pluginID, channelID, parentID string,
) error {
	sortOrder := 0
	rawID := extractThirdPartyFeedID(item)
	if rawID == "" {
		rawID = item.ID
	}
	id := ChapterFullID(pluginID, channelID, parentID, nativeChapterID(parentID, rawID))
	if existing, err := d.registry.store.GetChapterItem(ctx, id); err == nil {
		sortOrder = existing.SortOrder
	}
	row, err := chapterItemToRow(item, pluginID, channelID, parentID, sortOrder)
	if err != nil {
		return err
	}
	return d.registry.store.UpsertChapterItems(ctx, pluginID, channelID, parentID, []store.ChapterItemRow{row}, time.Now().Unix())
}

func (d *FeatureDispatcher) resolveChannel(pluginID, channelID string) (*PluginRecord, *FeedChannel, error) {
	rec, ok := d.registry.Get(pluginID)
	if !ok {
		return nil, nil, fmt.Errorf("plugin not found: %s", pluginID)
	}
	if !rec.Active {
		return nil, nil, fmt.Errorf("plugin is disabled: %s", pluginID)
	}
	channelID = ResolveChannelID(&rec.Config, channelID)
	ch, ok := findChannel(rec.Config.Channels, channelID)
	if !ok {
		return nil, nil, fmt.Errorf("channel not found: %s", channelID)
	}
	if !ChannelEnabled(ch) {
		return nil, nil, fmt.Errorf("channel is disabled: %s", channelID)
	}
	return rec, ch, nil
}

func (d *FeatureDispatcher) loadFeedItem(ctx context.Context, pluginID, channelID, itemID string) (FeedItem, error) {
	itemID = strings.TrimSpace(itemID)
	if itemID == "" {
		return FeedItem{}, fmt.Errorf("feed item id is required")
	}
	rec, ch, err := d.resolveChannel(pluginID, channelID)
	if err != nil {
		return FeedItem{}, err
	}
	features := ResolveFeatures(ch)
	if !features.Feed.Persist {
		if sess := d.sessions.Get(pluginID, channelID); sess != nil {
			for _, item := range sess.Ephemeral {
				if item.ID == itemID {
					return item, nil
				}
			}
		}
		return FeedItem{}, fmt.Errorf("feed item not found: %s", itemID)
	}
	row, err := d.registry.store.GetFeedItem(ctx, FeedFullID(rec.ID, ch.ID, itemID))
	if err != nil {
		row, err = d.registry.store.GetFeedItem(ctx, itemID)
		if err != nil {
			return FeedItem{}, err
		}
	}
	return rowToFeedItem(*row, true), nil
}

func (d *FeatureDispatcher) loadFeedItemOrStub(ctx context.Context, pluginID, channelID, itemID string) (FeedItem, bool, error) {
	item, err := d.loadFeedItem(ctx, pluginID, channelID, itemID)
	if err == nil {
		return item, true, nil
	}
	itemID = strings.TrimSpace(itemID)
	if itemID == "" {
		return FeedItem{}, false, err
	}
	return FeedItem{
		ID:        itemID,
		PluginID:  pluginID,
		ChannelID: channelID,
	}, false, nil
}

func (d *FeatureDispatcher) loadChapterItem(ctx context.Context, pluginID, channelID, parentID, itemID string) (FeedItem, error) {
	itemID = strings.TrimSpace(itemID)
	if itemID == "" {
		return FeedItem{}, fmt.Errorf("chapter item id is required")
	}
	parentID = strings.TrimSpace(parentID)
	nativeID := nativeChapterID(parentID, itemID)

	candidates := []string{
		ChapterFullID(pluginID, channelID, parentID, itemID),
		ChapterFullID(pluginID, channelID, parentID, nativeID),
		itemID,
	}
	seen := make(map[string]struct{}, len(candidates))
	for _, id := range candidates {
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		row, err := d.registry.store.GetChapterItem(ctx, id)
		if err == nil {
			return chapterRowToFeedItem(*row, true), nil
		}
	}

	rows, err := d.registry.store.ListChapterItems(ctx, pluginID, channelID, parentID)
	if err == nil {
		for _, row := range rows {
			apiID := chapterItemIDForAPI(row)
			if apiID == itemID || apiID == nativeID || row.ID == itemID {
				return chapterRowToFeedItem(row, true), nil
			}
			if native := nativeChapterID(parentID, apiID); native == nativeID {
				return chapterRowToFeedItem(row, true), nil
			}
		}
	}

	return FeedItem{
		ID:        itemID,
		PluginID:  pluginID,
		ChannelID: channelID,
	}, nil
}

func chapterItemToRow(item FeedItem, pluginID, channelID, parentID string, sortOrder int) (store.ChapterItemRow, error) {
	rawChapterID := extractThirdPartyFeedID(item)
	if rawChapterID == "" {
		rawChapterID = item.ID
	}
	chapterID := nativeChapterID(parentID, rawChapterID)
	id := ChapterFullID(pluginID, channelID, parentID, chapterID)
	payload, err := json.Marshal(map[string]any{
		"content":    item.Content,
		"sourceUrl":  item.SourceURL,
		"tags":       item.Tags,
		"type":       item.Type,
		"pluginName": item.PluginName,
	})
	if err != nil {
		return store.ChapterItemRow{}, err
	}
	return store.ChapterItemRow{
		ID:          id,
		PluginID:    pluginID,
		ChannelID:   channelID,
		ParentID:    parentID,
		Title:       item.Title,
		Summary:     item.Summary,
		Cover:       item.Image,
		PayloadJSON: string(payload),
		SortOrder:   sortOrder,
	}, nil
}

func chapterRowToFeedItem(row store.ChapterItemRow, includeContent bool) FeedItem {
	chapterID := chapterItemIDForAPI(row)
	item := FeedItem{
		ID:        chapterID,
		PluginID:  row.PluginID,
		ChannelID: row.ChannelID,
		Title:     row.Title,
		Summary:   row.Summary,
		Image:     row.Cover,
	}
	if row.PayloadJSON != "" {
		var payload struct {
			Content    string   `json:"content"`
			SourceURL  string   `json:"sourceUrl"`
			Tags       []string `json:"tags"`
			Type       string   `json:"type"`
			PluginName string   `json:"pluginName"`
		}
		_ = json.Unmarshal([]byte(row.PayloadJSON), &payload)
		if includeContent {
			item.Content = payload.Content
		}
		item.SourceURL = payload.SourceURL
		item.Tags = payload.Tags
		item.Type = payload.Type
		item.PluginName = payload.PluginName
	}
	return item
}

func paginateItems(items []FeedItem, limit, offset int) []FeedItem {
	if limit <= 0 {
		limit = 20
	}
	if offset >= len(items) {
		return nil
	}
	end := offset + limit
	if end > len(items) {
		end = len(items)
	}
	return items[offset:end]
}

func chapterItemIDForAPI(row store.ChapterItemRow) string {
	native := extractThirdPartyFeedID(FeedItem{
		ID:        row.ID,
		PluginID:  row.PluginID,
		ChannelID: row.ChannelID,
	})
	if native == "" {
		native = row.ID
	}
	if strings.Contains(native, ":") {
		return native
	}
	if parentID := strings.TrimSpace(row.ParentID); parentID != "" {
		return parentID + ":" + native
	}
	return native
}
