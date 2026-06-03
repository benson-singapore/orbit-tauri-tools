package plugin

import (
	"fmt"
	"strings"
)

const DefaultChannelID = "main"

// FeedChannel is one RSS source within a plugin.
type FeedChannel struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	FeedURL string `json:"feedUrl"`
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
	}
}

func validateChannels(channels []FeedChannel) error {
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
	if len(cfg.Channels) == 1 {
		return cfg.Channels[0].ID
	}
	return ""
}

func defaultChannelID(cfg *ManifestConfig) string {
	if dc := strings.TrimSpace(cfg.DefaultChannel); dc != "" {
		if _, ok := findChannel(cfg.Channels, dc); ok {
			return dc
		}
	}
	if len(cfg.Channels) > 0 {
		return cfg.Channels[0].ID
	}
	return DefaultChannelID
}
