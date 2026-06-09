package plugin

import (
	"fmt"
	"strings"
)

const DefaultChannelID = "main"

const DefaultChannelItemLimit = 100

const (
	ChannelStatusEnabled  = "enabled"
	ChannelStatusDisabled = "disabled"
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
		normalizeChannels(cfg)
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

func normalizeChannels(cfg *ManifestConfig) {
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
	}
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
