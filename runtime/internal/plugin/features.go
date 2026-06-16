package plugin

import (
	"fmt"
	"strconv"
	"strings"
)

const (
	PaginationStyleOffset = "offset"
	PaginationStyleCursor = "cursor"
	PaginationStyleLastID = "lastId"

	DefaultFeedLimit     = 100
	DefaultChaptersLimit = 500
)

type FeedFeature struct {
	Persist *bool `json:"persist,omitempty"`
	Refresh *bool `json:"refresh,omitempty"`
	Limit   *int  `json:"limit,omitempty"`
}

type PaginationFeature struct {
	Style       string `json:"style"`
	Param       string `json:"param,omitempty"`
	Default     string `json:"default,omitempty"`
	IDFrom      string `json:"idFrom,omitempty"`
	SizeParam   string `json:"sizeParam,omitempty"`
	DefaultSize *int   `json:"defaultSize,omitempty"`
}

type SearchFeature struct {
	Param    string `json:"param,omitempty"`
	Required *bool  `json:"required,omitempty"`
}

type DetailFeature struct {
	Route    string `json:"route"`
	IDParam  string `json:"idParam,omitempty"`
	IDFrom   string `json:"idFrom,omitempty"`
	Persist  *bool  `json:"persist,omitempty"`
}

type ChapterDetailFeature struct {
	Route       string `json:"route"`
	IDParam     string `json:"idParam,omitempty"`
	IDFrom      string `json:"idFrom,omitempty"`
	ParentParam string `json:"parentParam,omitempty"`
	ParentFrom  string `json:"parentFrom,omitempty"`
	Persist     *bool  `json:"persist,omitempty"`
}

type ChaptersFeature struct {
	Route      string                `json:"route"`
	IDParam    string                `json:"idParam,omitempty"`
	IDFrom     string                `json:"idFrom,omitempty"`
	Label      string                `json:"label,omitempty"`
	ItemLabel  string                `json:"itemLabel,omitempty"`
	Persist    *bool                 `json:"persist,omitempty"`
	Limit      *int                  `json:"limit,omitempty"`
	Pagination *PaginationFeature    `json:"pagination,omitempty"`
	Detail     *ChapterDetailFeature `json:"detail,omitempty"`
}

type ChannelFeatures struct {
	Feed       *FeedFeature       `json:"feed,omitempty"`
	Pagination *PaginationFeature `json:"pagination,omitempty"`
	Search     *SearchFeature     `json:"search,omitempty"`
	Detail     *DetailFeature     `json:"detail,omitempty"`
	Chapters   *ChaptersFeature   `json:"chapters,omitempty"`
}

type ResolvedFeedFeature struct {
	Persist bool
	Refresh bool
	Limit   int
}

type ResolvedDetailFeature struct {
	Route   string
	IDParam string
	IDFrom  string
	Persist bool
}

type ResolvedChapterDetailFeature struct {
	Route       string
	IDParam     string
	IDFrom      string
	ParentParam string
	ParentFrom  string
	Persist     bool
}

type ResolvedChaptersFeature struct {
	Route      string
	IDParam    string
	IDFrom     string
	Label      string
	ItemLabel  string
	Persist    bool
	Limit      int
	Pagination *PaginationFeature
	Detail     *ResolvedChapterDetailFeature
}

type ResolvedFeatures struct {
	Feed       ResolvedFeedFeature
	Pagination *PaginationFeature
	Search     *SearchFeature
	Detail     *ResolvedDetailFeature
	Chapters   *ResolvedChaptersFeature
}

type ChannelCapabilities struct {
	CanRefresh          bool   `json:"canRefresh"`
	CanLoadMore         bool   `json:"canLoadMore"`
	CanLoadMoreChapters bool   `json:"canLoadMoreChapters"`
	CanRefreshChapters  bool   `json:"canRefreshChapters"`
	CanSearch           bool   `json:"canSearch"`
	HasDetail           bool   `json:"hasDetail"`
	HasChapters         bool   `json:"hasChapters"`
	PersistList         bool   `json:"persistList"`
	ChaptersLabel       string `json:"chaptersLabel,omitempty"`
	ChaptersItemLabel   string `json:"chaptersItemLabel,omitempty"`
}

type FetchRequest struct {
	ChannelID string            `json:"channelId"`
	Route     string            `json:"route"`
	Params    map[string]string `json:"params,omitempty"`
	Vars      map[string]string `json:"vars,omitempty"`
}

type FetchResult struct {
	Title       string            `json:"title"`
	Description string            `json:"description,omitempty"`
	Items       []FeedItem        `json:"items"`
	HasMore     *bool             `json:"hasMore,omitempty"`
	Next        map[string]string `json:"next,omitempty"`
}

type Trigger string

const (
	TriggerScheduled         Trigger = "scheduled"
	TriggerRefresh           Trigger = "refresh"
	TriggerLoadMore          Trigger = "loadMore"
	TriggerSearch            Trigger = "search"
	TriggerOpenDetail        Trigger = "openDetail"
	TriggerOpenChapters           Trigger = "openChapters"
	TriggerLoadMoreChapters       Trigger = "loadMoreChapters"
	TriggerOpenChapterDetail      Trigger = "openChapterDetail"
	TriggerRefreshChapters        Trigger = "refreshChapters"
	TriggerClearRefreshChapters   Trigger = "clearRefreshChapters"
)

func boolVal(v *bool, def bool) bool {
	if v == nil {
		return def
	}
	return *v
}

func intVal(v *int, def int) int {
	if v == nil || *v <= 0 {
		return def
	}
	return *v
}

func ResolveFeatures(ch *FeedChannel) ResolvedFeatures {
	f := ch.Features
	out := ResolvedFeatures{
		Feed: ResolvedFeedFeature{
			Persist: true,
			Refresh: true,
			Limit:   DefaultFeedLimit,
		},
	}
	if f.Feed != nil {
		out.Feed.Persist = boolVal(f.Feed.Persist, true)
		out.Feed.Refresh = boolVal(f.Feed.Refresh, true)
		out.Feed.Limit = intVal(f.Feed.Limit, DefaultFeedLimit)
	}
	if f.Pagination != nil {
		pag := *f.Pagination
		if pag.Param == "" {
			pag.Param = defaultParamForStyle(pag.Style)
		}
		if pag.Default == "" {
			pag.Default = defaultValueForStyle(pag.Style)
		}
		if pag.IDFrom == "" {
			pag.IDFrom = "item.id"
		}
		out.Pagination = &pag
	}
	if f.Search != nil {
		search := *f.Search
		if search.Param == "" {
			search.Param = "query"
		}
		out.Search = &search
	}
	if f.Detail != nil {
		d := f.Detail
		out.Detail = &ResolvedDetailFeature{
			Route:   d.Route,
			IDParam: defaultString(d.IDParam, "id"),
			IDFrom:  defaultString(d.IDFrom, "item.id"),
			Persist: boolVal(d.Persist, true),
		}
	}
	if f.Chapters != nil {
		c := f.Chapters
		resolved := &ResolvedChaptersFeature{
			Route:     c.Route,
			IDParam:   defaultString(c.IDParam, "id"),
			IDFrom:    defaultString(c.IDFrom, "item.id"),
			Label:     c.Label,
			ItemLabel: c.ItemLabel,
			Persist:   boolVal(c.Persist, false),
			Limit:     intVal(c.Limit, DefaultChaptersLimit),
		}
		if c.Pagination != nil {
			pag := *c.Pagination
			if pag.Param == "" {
				pag.Param = defaultParamForStyle(pag.Style)
			}
			if pag.Default == "" {
				pag.Default = defaultValueForStyle(pag.Style)
			}
			resolved.Pagination = &pag
		}
		if c.Detail != nil {
			d := c.Detail
			resolved.Detail = &ResolvedChapterDetailFeature{
				Route:       d.Route,
				IDParam:     defaultString(d.IDParam, "chapterId"),
				IDFrom:      defaultString(d.IDFrom, "item.id"),
				ParentParam: defaultString(d.ParentParam, "id"),
				ParentFrom:  defaultString(d.ParentFrom, "parent.id"),
				Persist:     boolVal(d.Persist, false),
			}
		}
		out.Chapters = resolved
	}
	return out
}

func GetChannelCapabilities(ch *FeedChannel) ChannelCapabilities {
	f := ResolveFeatures(ch)
	cap := ChannelCapabilities{
		CanRefresh:  f.Feed.Refresh,
		CanLoadMore: f.Pagination != nil,
		CanSearch:   f.Search != nil,
		HasDetail:   f.Detail != nil && f.Chapters == nil,
		HasChapters: f.Chapters != nil,
		PersistList: f.Feed.Persist,
	}
	if f.Chapters != nil {
		cap.ChaptersLabel = f.Chapters.Label
		cap.ChaptersItemLabel = f.Chapters.ItemLabel
		cap.CanLoadMoreChapters = f.Chapters.Pagination != nil
		cap.CanRefreshChapters = f.Chapters.Persist
	}
	return cap
}

func ValidateChannelFeatures(ch FeedChannel) error {
	f := ch.Features
	if f.Detail != nil && f.Chapters != nil {
		return fmt.Errorf("channel %q: features.detail and features.chapters are mutually exclusive", ch.ID)
	}
	if f.Detail != nil && strings.TrimSpace(f.Detail.Route) == "" {
		return fmt.Errorf("channel %q: features.detail.route is required", ch.ID)
	}
	if f.Chapters != nil {
		if strings.TrimSpace(f.Chapters.Route) == "" {
			return fmt.Errorf("channel %q: features.chapters.route is required", ch.ID)
		}
		if f.Chapters.Detail != nil && strings.TrimSpace(f.Chapters.Detail.Route) == "" {
			return fmt.Errorf("channel %q: features.chapters.detail.route is required", ch.ID)
		}
	}
	if f.Pagination != nil {
		style := strings.TrimSpace(f.Pagination.Style)
		switch style {
		case PaginationStyleOffset, PaginationStyleCursor, PaginationStyleLastID:
		default:
			return fmt.Errorf("channel %q: unsupported pagination style %q", ch.ID, style)
		}
	}
	if f.Chapters != nil && f.Chapters.Pagination != nil {
		style := strings.TrimSpace(f.Chapters.Pagination.Style)
		switch style {
		case PaginationStyleOffset, PaginationStyleCursor, PaginationStyleLastID:
		default:
			return fmt.Errorf("channel %q: unsupported chapters.pagination style %q", ch.ID, style)
		}
	}
	return nil
}

func validateWasmChannelV1Fields(ch FeedChannel) error {
	if strings.TrimSpace(ch.Type) != "" {
		return fmt.Errorf("channel %q: legacy field \"type\" is not supported in v2 manifests; use features instead", ch.ID)
	}
	if ch.Dynamic {
		return fmt.Errorf("channel %q: legacy field \"dynamic\" is not supported in v2 manifests; use features instead", ch.ID)
	}
	if ch.ItemLimit > 0 {
		return fmt.Errorf("channel %q: legacy field \"itemLimit\" is not supported in v2 manifests; use features.feed.limit instead", ch.ID)
	}
	return nil
}

func channelHasExplicitFeatures(ch *FeedChannel) bool {
	if ch == nil {
		return false
	}
	f := ch.Features
	return f.Feed != nil || f.Pagination != nil || f.Search != nil || f.Detail != nil || f.Chapters != nil
}

func isLegacySearchRoute(route string) bool {
	route = strings.ToLower(strings.TrimSpace(route))
	return strings.Contains(route, "/search/") || strings.HasSuffix(route, "/search")
}

func intPtr(v int) *int {
	return &v
}

func boolPtr(v bool) *bool {
	return &v
}

// MigrateChannelV1ToFeatures converts legacy type/dynamic/itemLimit into features v2.
// Returns true if any legacy fields were present and cleared.
func MigrateChannelV1ToFeatures(ch *FeedChannel, mediaType string) bool {
	if ch == nil {
		return false
	}
	hasLegacy := ch.ItemLimit > 0 || ch.Dynamic || strings.TrimSpace(ch.Type) != ""
	if !hasLegacy {
		return false
	}

	if channelHasExplicitFeatures(ch) {
		ch.ItemLimit = 0
		ch.Dynamic = false
		ch.Type = ""
		return true
	}

	channelType := strings.ToLower(strings.TrimSpace(ch.Type))
	limit := ch.ItemLimit
	if limit <= 0 {
		limit = DefaultFeedLimit
	}

	if channelType == ChannelTypeDetail {
		persist := true
		ch.Features.Detail = &DetailFeature{
			Route:   ch.Route,
			Persist: boolPtr(persist),
		}
	} else if channelType == ChannelTypeSearch && isLegacySearchRoute(ch.Route) {
		ch.Features.Feed = &FeedFeature{
			Persist: boolPtr(false),
			Refresh: boolPtr(false),
			Limit:   intPtr(limit),
		}
		required := true
		ch.Features.Search = &SearchFeature{
			Param:    "query",
			Required: boolPtr(required),
		}
		if ch.Params != nil {
			if _, ok := ch.Params["page"]; ok {
				ch.Features.Pagination = &PaginationFeature{
					Style:   PaginationStyleOffset,
					Param:   "page",
					Default: "1",
				}
			}
		}
	} else {
		// Subscription / browse channels (includes 1x image galleries mis-tagged as search).
		_ = mediaType
		ch.Features.Feed = &FeedFeature{
			Persist: boolPtr(true),
			Refresh: boolPtr(true),
			Limit:   intPtr(limit),
		}
		if ch.Params != nil {
			if _, hasPage := ch.Params["page"]; hasPage {
				size := 20
				if s, ok := ch.Params["size"]; ok {
					if n, err := strconv.Atoi(strings.TrimSpace(s)); err == nil && n > 0 {
						size = n
					}
				}
				ch.Features.Pagination = &PaginationFeature{
					Style:       PaginationStyleOffset,
					Param:       "page",
					Default:     "1",
					SizeParam:   "size",
					DefaultSize: intPtr(size),
				}
			}
		}
	}

	ch.ItemLimit = 0
	ch.Dynamic = false
	ch.Type = ""
	return true
}

// MigrateManifestChannelsV2 upgrades all channels and merges hidden detail channels into parents.
func MigrateManifestChannelsV2(cfg *ManifestConfig, mediaType string) bool {
	if cfg == nil {
		return false
	}
	changed := false
	for i := range cfg.Channels {
		if MigrateChannelV1ToFeatures(&cfg.Channels[i], mediaType) {
			changed = true
		}
	}
	if mergeLegacyDetailChannels(cfg) {
		changed = true
	}
	return changed
}

func mergeLegacyDetailChannels(cfg *ManifestConfig) bool {
	detailIdx := -1
	var detailRoute string
	for i, ch := range cfg.Channels {
		if strings.EqualFold(strings.TrimSpace(ch.Type), ChannelTypeDetail) &&
			(ChannelStatus(&ch) == ChannelStatusDisabled || ch.Dynamic) {
			detailIdx = i
			detailRoute = strings.TrimSpace(ch.Route)
			break
		}
	}
	if detailIdx < 0 || detailRoute == "" {
		return false
	}
	persist := true
	for i := range cfg.Channels {
		if i == detailIdx {
			continue
		}
		if cfg.Channels[i].Features.Detail != nil {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(cfg.Channels[i].Type), ChannelTypeDetail) {
			continue
		}
		cfg.Channels[i].Features.Detail = &DetailFeature{
			Route:   detailRoute,
			Persist: boolPtr(persist),
		}
	}
	cfg.Channels = append(cfg.Channels[:detailIdx], cfg.Channels[detailIdx+1:]...)
	return true
}

func rawManifestHasLegacyV1Fields(data []byte) bool {
	s := string(data)
	return strings.Contains(s, `"type"`) ||
		strings.Contains(s, `"dynamic"`) ||
		strings.Contains(s, `"itemLimit"`)
}

func FeedItemLimit(ch *FeedChannel) int {
	return ResolveFeatures(ch).Feed.Limit
}

func ChannelFeedRefresh(ch *FeedChannel) bool {
	return ResolveFeatures(ch).Feed.Refresh
}

func ChannelFeedPersist(ch *FeedChannel) bool {
	return ResolveFeatures(ch).Feed.Persist
}

func defaultString(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

func defaultParamForStyle(style string) string {
	switch style {
	case PaginationStyleLastID:
		return "lastId"
	default:
		return "page"
	}
}

func defaultValueForStyle(style string) string {
	switch style {
	case PaginationStyleLastID:
		return ""
	default:
		return "1"
	}
}

func baseParams(ch *FeedChannel) map[string]string {
	params := make(map[string]string, len(ch.Params))
	for k, v := range ch.Params {
		params[k] = v
	}
	return params
}

func ParamsForRefresh(ch *FeedChannel, features ResolvedFeatures) map[string]string {
	params := baseParams(ch)
	if pag := features.Pagination; pag != nil {
		key := pag.Param
		if key == "" {
			key = defaultParamForStyle(pag.Style)
		}
		params[key] = pag.Default
		if pag.Default == "" {
			delete(params, key)
		}
	}
	return params
}

func ParamsForLoadMore(
	ch *FeedChannel,
	features ResolvedFeatures,
	lastResponse *FetchResult,
	dbItems []FeedItem,
) (map[string]string, error) {
	if features.Pagination == nil {
		return nil, fmt.Errorf("channel has no pagination")
	}
	params := baseParams(ch)
	pag := features.Pagination

	if lastResponse != nil && len(lastResponse.Next) > 0 {
		for k, v := range lastResponse.Next {
			params[k] = v
		}
		return params, nil
	}

	paramKey := pag.Param
	if paramKey == "" {
		paramKey = defaultParamForStyle(pag.Style)
	}

	switch pag.Style {
	case PaginationStyleOffset, PaginationStyleCursor:
		current, _ := strconv.Atoi(params[paramKey])
		if current <= 0 {
			def, _ := strconv.Atoi(pag.Default)
			if def <= 0 {
				def = 1
			}
			current = def
		}
		params[paramKey] = strconv.Itoa(current + 1)
	case PaginationStyleLastID:
		var last *FeedItem
		if len(dbItems) > 0 {
			last = &dbItems[len(dbItems)-1]
		} else if lastResponse != nil && len(lastResponse.Items) > 0 {
			last = &lastResponse.Items[len(lastResponse.Items)-1]
		}
		if last == nil {
			return nil, fmt.Errorf("no item to paginate from")
		}
		params[paramKey] = extractThirdPartyFeedID(*last)
		if params[paramKey] == "" {
			params[paramKey] = last.ID
		}
	default:
		return nil, fmt.Errorf("unsupported pagination style %q", pag.Style)
	}
	return params, nil
}

func ParamsForSearch(ch *FeedChannel, features ResolvedFeatures, query string) map[string]string {
	params := baseParams(ch)
	if features.Search != nil {
		key := features.Search.Param
		if key == "" {
			key = "query"
		}
		params[key] = query
	}
	if pag := features.Pagination; pag != nil {
		key := pag.Param
		if key == "" {
			key = defaultParamForStyle(pag.Style)
		}
		params[key] = pag.Default
		if pag.Default == "" {
			delete(params, key)
		}
	}
	return params
}

func ParamsForDetail(features ResolvedFeatures, item FeedItem) (string, map[string]string) {
	d := features.Detail
	idParam := d.IDParam
	idValue := extractThirdPartyFeedID(item)
	if idValue == "" {
		idValue = item.ID
	}
	return d.Route, map[string]string{idParam: idValue}
}

func ParamsForChapters(features ResolvedFeatures, item FeedItem) (string, map[string]string) {
	c := features.Chapters
	idValue := extractThirdPartyFeedID(item)
	if idValue == "" {
		idValue = item.ID
	}
	params := map[string]string{c.IDParam: idValue}
	if pag := c.Pagination; pag != nil {
		key := pag.Param
		if key == "" {
			key = defaultParamForStyle(pag.Style)
		}
		params[key] = pag.Default
		if pag.Default == "" {
			delete(params, key)
		}
	}
	return c.Route, params
}

func ParamsForChaptersRefresh(features ResolvedFeatures, item FeedItem) (string, map[string]string) {
	return ParamsForChapters(features, item)
}

func ParamsForChaptersLoadMore(
	features ResolvedFeatures,
	parentItem FeedItem,
	lastParams map[string]string,
	lastResponse *FetchResult,
	dbItems []FeedItem,
) (map[string]string, error) {
	if features.Chapters == nil || features.Chapters.Pagination == nil {
		return nil, fmt.Errorf("channel has no chapters pagination")
	}
	_, baseParams := ParamsForChapters(features, parentItem)
	pag := features.Chapters.Pagination

	paramKey := pag.Param
	if paramKey == "" {
		paramKey = defaultParamForStyle(pag.Style)
	}

	params := make(map[string]string, len(baseParams))
	for k, v := range baseParams {
		params[k] = v
	}
	if len(lastParams) > 0 {
		for k, v := range lastParams {
			params[k] = v
		}
	}

	if lastResponse != nil && len(lastResponse.Next) > 0 {
		for k, v := range lastResponse.Next {
			params[k] = v
		}
		if pag.Style == PaginationStyleOffset || pag.Style == PaginationStyleCursor {
			if page := strings.TrimSpace(lastResponse.Next[paramKey]); page != "" {
				return params, nil
			}
		}
	}

	switch pag.Style {
	case PaginationStyleOffset, PaginationStyleCursor:
		current, _ := strconv.Atoi(params[paramKey])
		if current <= 0 {
			def, _ := strconv.Atoi(pag.Default)
			if def <= 0 {
				def = 1
			}
			current = def
		}
		params[paramKey] = strconv.Itoa(current + 1)
	case PaginationStyleLastID:
		var last *FeedItem
		if len(dbItems) > 0 {
			last = &dbItems[len(dbItems)-1]
		} else if lastResponse != nil && len(lastResponse.Items) > 0 {
			last = &lastResponse.Items[len(lastResponse.Items)-1]
		}
		if last == nil {
			return nil, fmt.Errorf("no chapter item to paginate from")
		}
		params[paramKey] = extractThirdPartyFeedID(*last)
		if params[paramKey] == "" {
			params[paramKey] = last.ID
		}
	default:
		return nil, fmt.Errorf("unsupported chapters pagination style %q", pag.Style)
	}
	return params, nil
}

func InferChaptersHasMore(result FetchResult, features ResolvedFeatures) bool {
	if result.HasMore != nil {
		return *result.HasMore
	}
	if features.Chapters != nil && features.Chapters.Pagination != nil {
		return len(result.Items) > 0
	}
	return false
}

func ParamsForChapterDetail(features ResolvedFeatures, parentItem, chapterItem FeedItem) (string, map[string]string) {
	d := features.Chapters.Detail
	parentID := extractThirdPartyFeedID(parentItem)
	if parentID == "" {
		parentID = parentItem.ID
	}
	chapterID := extractThirdPartyFeedID(chapterItem)
	if chapterID == "" {
		chapterID = chapterItem.ID
	}
	chapterID = nativeChapterID(parentID, chapterID)
	return d.Route, map[string]string{
		d.ParentParam: parentID,
		d.IDParam:     chapterID,
	}
}

func IsHomePage(params map[string]string, pag *PaginationFeature) bool {
	if pag == nil {
		return true
	}
	key := pag.Param
	if key == "" {
		key = defaultParamForStyle(pag.Style)
	}
	val := params[key]
	def := pag.Default
	if def == "" {
		def = defaultValueForStyle(pag.Style)
	}
	return val == def
}

func FeedFullID(pluginID, channelID, itemID string) string {
	return pluginID + ":" + channelID + ":" + itemID
}

func ChapterFullID(pluginID, channelID, parentID, chapterID string) string {
	return pluginID + ":" + channelID + ":" + parentID + ":" + chapterID
}

func InferHasMore(result FetchResult, features ResolvedFeatures) bool {
	if result.HasMore != nil {
		return *result.HasMore
	}
	return len(result.Items) > 0 && features.Pagination != nil
}
