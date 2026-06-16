package plugin

import "testing"

func TestResolveChannelIDAllAggregatesMultipleChannels(t *testing.T) {
	cfg := ManifestConfig{
		Channels: []FeedChannel{
			{ID: "android", Label: "Android"},
			{ID: "frontend", Label: "Frontend"},
		},
		DefaultChannel: "android",
	}
	if got := ResolveChannelID(&cfg, "all"); got != "" {
		t.Fatalf("expected empty channel for aggregate, got %q", got)
	}
	if got := ResolveChannelID(&cfg, ""); got != "" {
		t.Fatalf("expected empty channel for aggregate, got %q", got)
	}
}

func TestResolveChannelIDAllUsesSingleEnabledChannel(t *testing.T) {
	cfg := ManifestConfig{
		Channels: []FeedChannel{
			{ID: "main", Label: "Main"},
		},
	}
	if got := ResolveChannelID(&cfg, "all"); got != "main" {
		t.Fatalf("expected single channel main, got %q", got)
	}
}

func TestResolveChannelIDSpecificChannel(t *testing.T) {
	cfg := ManifestConfig{
		Channels: []FeedChannel{
			{ID: "android", Label: "Android"},
			{ID: "frontend", Label: "Frontend"},
		},
	}
	if got := ResolveChannelID(&cfg, "frontend"); got != "frontend" {
		t.Fatalf("expected frontend, got %q", got)
	}
}
