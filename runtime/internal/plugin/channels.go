package plugin

import (
	"fmt"
	"strconv"
	"strings"
)

const DefaultChannelID = "main"

const DefaultChannelItemLimit = 100

const (
	ChannelStatusEnabled  = "enabled"
	ChannelStatusDisabled = "disabled"

	ChannelTypeSearch = "search"
)

// FeedChannel is one feed source within a plugin (RSS feedUrl or WASM route).
type FeedChannel struct {
	ID        string            `json:"id"`
	Label     string            `json:"label"`
	FeedURL   string            `json:"feedUrl,omitempty"`
	Route     string            `json:"route,omitempty"`
	Params    map[string]string `json:"params,omitempty"`
	ItemLimit int               `json:"itemLimit,omitempty"`
	Status    string            `json:"status,omitempty"` // enabled (default) | disabled
	Type      string            `json:"type,omitempty"`   // search | empty (feed)
	Dynamic   bool              `json:"dynamic,omitempty"`
}

const DynamicSearchMaxPages = 20

const DefaultFeedPageSize = 20

// ChannelDynamic reports whether the channel is fetched on-demand (not cached by scheduler).
func ChannelDynamic(ch *FeedChannel) bool {
	if ch == nil {
		return false
	}
	inferSearchChannelMetadata(ch)
	return ch.Dynamic
}

// ChannelBrowseDynamic reports image-plugin channels with explicit dynamic: true (browse by params, no q).
func ChannelBrowseDynamic(ch *FeedChannel, mediaType string) bool {
	if ch == nil || mediaType != MediaImage {
		return false
	}
	return ch.Dynamic
}

// ChannelStatus returns the effective channel status (empty means enabled).
func ChannelStatus(ch *FeedChannel) string {
	if ch == nil {
		return ChannelStatusEnabled
	}
	switch strings.TrimSpace(strings.ToLower(ch.Status)) {
	case ChannelStatusDisabled:
		return ChannelStatusDisabled
	default:
		return ChannelStatusEnabled
	}
}

// ChannelEnabled reports whether the channel should be shown and refreshed.
func ChannelEnabled(ch *FeedChannel) bool {
	return ChannelStatus(ch) != ChannelStatusDisabled
}

// EnabledChannels returns only channels that are not disabled.
func EnabledChannels(channels []FeedChannel) []FeedChannel {
	out := make([]FeedChannel, 0, len(channels))
	for _, ch := range channels {
		if ChannelEnabled(&ch) {
			out = append(out, ch)
		}
	}
	return out
}

func ChannelItemLimit(ch *FeedChannel) int {
	if ch == nil || ch.ItemLimit <= 0 {
		return DefaultChannelItemLimit
	}
	return ch.ItemLimit
}

// MigrateManifestConfig converts legacy config.feedUrl into a single channel.
func MigrateManifestConfig(cfg *ManifestConfig) {
	if len(cfg.Channels) > 0 {
		normalizeChannels(cfg, "")
		return
	}
	legacy := strings.TrimSpace(cfg.LegacyFeedURL)
	if legacy == "" {
		return
	}
	cfg.Channels = []FeedChannel{{
		ID:      DefaultChannelID,
		Label:   "全部",
		FeedURL: legacy,
	}}
	cfg.LegacyFeedURL = ""
}

func normalizeChannels(cfg *ManifestConfig, mediaType string) {
	for i := range cfg.Channels {
		cfg.Channels[i].ID = strings.TrimSpace(cfg.Channels[i].ID)
		cfg.Channels[i].Label = strings.TrimSpace(cfg.Channels[i].Label)
		cfg.Channels[i].FeedURL = strings.TrimSpace(cfg.Channels[i].FeedURL)
		cfg.Channels[i].Route = strings.TrimSpace(cfg.Channels[i].Route)
		status := strings.TrimSpace(strings.ToLower(cfg.Channels[i].Status))
		switch status {
		case "", ChannelStatusEnabled:
			cfg.Channels[i].Status = ""
		case ChannelStatusDisabled:
			cfg.Channels[i].Status = ChannelStatusDisabled
		}
		inferSearchChannelMetadata(&cfg.Channels[i])
		inferBrowseChannelMetadata(&cfg.Channels[i], mediaType)
	}
}

func inferBrowseChannelMetadata(ch *FeedChannel, mediaType string) {
	if ch == nil || ch.Dynamic {
		return
	}
	if mediaType != MediaImage {
		return
	}
	if isSearchRoute(ch.Route) || strings.EqualFold(strings.TrimSpace(ch.Type), ChannelTypeSearch) {
		return
	}
	if strings.TrimSpace(ch.Route) != "" && strings.TrimSpace(ch.FeedURL) == "" {
		ch.Dynamic = true
	}
}

func isSearchRoute(route string) bool {
	route = strings.ToLower(strings.TrimSpace(route))
	return strings.Contains(route, "/search/") || strings.HasSuffix(route, "/search")
}

// inferSearchChannelMetadata marks WASM search routes as dynamic feed channels.
func inferSearchChannelMetadata(ch *FeedChannel) {
	if ch == nil || ch.Dynamic {
		return
	}
	if isSearchRoute(ch.Route) || strings.EqualFold(strings.TrimSpace(ch.Type), ChannelTypeSearch) {
		ch.Dynamic = true
		if strings.TrimSpace(ch.Type) == "" {
			ch.Type = ChannelTypeSearch
		}
	}
}

// ChannelsForAPI returns enabled channels with search/browse metadata normalized for clients.
func ChannelsForAPI(channels []FeedChannel, mediaType string) []FeedChannel {
	out := EnabledChannels(channels)
	for i := range out {
		inferSearchChannelMetadata(&out[i])
		inferBrowseChannelMetadata(&out[i], mediaType)
	}
	return out
}

func validateChannelStatus(ch FeedChannel) error {
	status := strings.TrimSpace(strings.ToLower(ch.Status))
	if status == "" || status == ChannelStatusEnabled || status == ChannelStatusDisabled {
		return nil
	}
	return fmt.Errorf("channel %q has unsupported status %q", ch.ID, ch.Status)
}

func validateRSSChannels(channels []FeedChannel) error {
	if len(channels) < 1 {
		return fmt.Errorf("rss plugin requires at least one config.channels entry")
	}
	seenID := make(map[string]struct{}, len(channels))
	seenURL := make(map[string]struct{}, len(channels))
	for _, ch := range channels {
		if ch.ID == "" {
			return fmt.Errorf("channel id is required")
		}
		if ch.Label == "" {
			return fmt.Errorf("channel %q requires label", ch.ID)
		}
		if ch.FeedURL == "" {
			return fmt.Errorf("channel %q requires feedUrl", ch.ID)
		}
		if _, ok := seenID[ch.ID]; ok {
			return fmt.Errorf("duplicate channel id %q", ch.ID)
		}
		seenID[ch.ID] = struct{}{}
		if _, ok := seenURL[ch.FeedURL]; ok {
			return fmt.Errorf("duplicate channel feedUrl for %q", ch.ID)
		}
		seenURL[ch.FeedURL] = struct{}{}
		if err := validateChannelStatus(ch); err != nil {
			return err
		}
	}
	return nil
}

func validateWasmChannels(channels []FeedChannel) error {
	if len(channels) < 1 {
		return fmt.Errorf("wasm plugin requires at least one config.channels entry")
	}
	seenID := make(map[string]struct{}, len(channels))
	seenRoute := make(map[string]struct{}, len(channels))
	for _, ch := range channels {
		if ch.ID == "" {
			return fmt.Errorf("channel id is required")
		}
		if ch.Label == "" {
			return fmt.Errorf("channel %q requires label", ch.ID)
		}
		if ch.Route == "" {
			return fmt.Errorf("channel %q requires route", ch.ID)
		}
		if ch.FeedURL != "" {
			return fmt.Errorf("channel %q must not set feedUrl for wasm plugins", ch.ID)
		}
		if _, ok := seenID[ch.ID]; ok {
			return fmt.Errorf("duplicate channel id %q", ch.ID)
		}
		seenID[ch.ID] = struct{}{}
		routeKey := ch.Route + "|" + fmt.Sprintf("%v", ch.Params)
		if _, ok := seenRoute[routeKey]; ok {
			return fmt.Errorf("duplicate channel route for %q", ch.ID)
		}
		seenRoute[routeKey] = struct{}{}
		if err := validateChannelStatus(ch); err != nil {
			return err
		}
	}
	return nil
}

func findChannel(channels []FeedChannel, id string) (*FeedChannel, bool) {
	id = strings.TrimSpace(id)
	for i := range channels {
		if channels[i].ID == id {
			return &channels[i], true
		}
	}
	return nil, false
}

// ResolveChannelID picks the channel to use when the client omits channel.
func ResolveChannelID(cfg *ManifestConfig, channelID string) string {
	channelID = strings.TrimSpace(channelID)
	if channelID != "" {
		return channelID
	}
	enabled := EnabledChannels(cfg.Channels)
	if len(enabled) == 1 {
		return enabled[0].ID
	}
	return ""
}

// WasmPageFromOffset converts feed API offset/limit into a 1-based WASM page number.
func WasmPageFromOffset(limit, offset int) int {
	if limit <= 0 {
		limit = DefaultFeedPageSize
	}
	return offset/limit + 1
}

// DynamicImageWasmOverrides builds WASM param overrides for a paged image gallery feed.
func DynamicImageWasmOverrides(ch *FeedChannel, limit, offset int) map[string]string {
	page := WasmPageFromOffset(limit, offset)
	if limit <= 0 {
		limit = DefaultFeedPageSize
	}
	pageKey := channelPageParamKey(ch)
	if pageKey == "" {
		pageKey = "page"
	}
	sizeKey := channelSizeParamKey(ch)
	if sizeKey == "" {
		sizeKey = "size"
	}
	return map[string]string{
		pageKey: strconv.Itoa(page),
		sizeKey: strconv.Itoa(limit),
	}
}

// DynamicSearchWasmOverrides builds WASM param overrides for a paged search request.
func DynamicSearchWasmOverrides(ch *FeedChannel, query string, limit, offset int) map[string]string {
	page := WasmPageFromOffset(limit, offset)
	queryKey := channelSearchParamKey(ch)
	if queryKey == "" {
		queryKey = "query"
	}
	pageKey := channelPageParamKey(ch)
	if pageKey == "" {
		pageKey = "page"
	}
	return map[string]string{
		queryKey: strings.TrimSpace(query),
		pageKey:  strconv.Itoa(page),
	}
}

// BuildDynamicSearchParams merges channel defaults with a live search query and page.
func BuildDynamicSearchParams(ch *FeedChannel, query string, page int) map[string]string {
	params := make(map[string]string, len(ch.Params)+2)
	for k, v := range ch.Params {
		params[k] = v
	}
	queryKey := channelSearchParamKey(ch)
	if queryKey == "" {
		queryKey = "query"
	}
	pageKey := channelPageParamKey(ch)
	if pageKey == "" {
		pageKey = "page"
	}
	params[queryKey] = strings.TrimSpace(query)
	if page > 0 {
		params[pageKey] = strconv.Itoa(page)
	}
	return params
}

func channelSearchParamKey(ch *FeedChannel) string {
	if ch == nil {
		return ""
	}
	if key := firstRouteParam(ch.Route); key != "" {
		return key
	}
	for k, v := range ch.Params {
		if k == "page" {
			continue
		}
		if strings.TrimSpace(v) == "" {
			return k
		}
	}
	return ""
}

func channelPageParamKey(ch *FeedChannel) string {
	if ch == nil {
		return ""
	}
	if ch.Params != nil {
		if _, ok := ch.Params["page"]; ok {
			return "page"
		}
	}
	if isSearchRoute(ch.Route) {
		return "page"
	}
	return ""
}

func channelSizeParamKey(ch *FeedChannel) string {
	if ch == nil {
		return ""
	}
	if ch.Params != nil {
		if _, ok := ch.Params["size"]; ok {
			return "size"
		}
	}
	return ""
}

func firstRouteParam(route string) string {
	parts := strings.Split(strings.TrimSpace(route), "/")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, ":") {
			return strings.TrimPrefix(part, ":")
		}
	}
	return ""
}

func defaultChannelID(cfg *ManifestConfig) string {
	if dc := strings.TrimSpace(cfg.DefaultChannel); dc != "" {
		if ch, ok := findChannel(cfg.Channels, dc); ok && ChannelEnabled(ch) {
			return dc
		}
	}
	enabled := EnabledChannels(cfg.Channels)
	if len(enabled) > 0 {
		return enabled[0].ID
	}
	if len(cfg.Channels) > 0 {
		return cfg.Channels[0].ID
	}
	return DefaultChannelID
}
