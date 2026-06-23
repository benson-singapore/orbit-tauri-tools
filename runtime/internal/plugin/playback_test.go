package plugin

import "testing"

func TestResolvePlaybackDefaults(t *testing.T) {
	m := &Manifest{
		MediaType: MediaVideo,
		Config: ManifestConfig{
			Playback: &PlaybackConfig{
				History:  boolPtr(true),
				Progress: boolPtr(true),
			},
		},
	}
	pb := ResolvePlayback(m, nil)
	if !pb.History || !pb.Progress {
		t.Fatalf("expected history and progress enabled")
	}
	if pb.Mode != PlaybackModeVideo {
		t.Fatalf("expected video mode, got %q", pb.Mode)
	}
	if pb.ManagedBy != ManagedByRuntime {
		t.Fatalf("expected runtime managedBy")
	}
}

func TestResolvePlaybackCapabilityDefault(t *testing.T) {
	m := &Manifest{
		MediaType:    MediaVideo,
		Capabilities: []string{CapFeed, CapPlayback},
	}
	pb := ResolvePlayback(m, nil)
	if !pb.History || !pb.Progress {
		t.Fatalf("expected playback capability to enable history and progress")
	}
}

func TestResolvePlaybackChannelOverride(t *testing.T) {
	m := &Manifest{
		MediaType: MediaArticle,
		Config: ManifestConfig{
			Playback: &PlaybackConfig{
				History: boolPtr(false),
				Mode:    PlaybackModeArticle,
			},
		},
	}
	ch := &FeedChannel{
		ID: "main",
		Features: ChannelFeatures{
			Playback: &PlaybackFeature{
				History: boolPtr(true),
				Mode:    PlaybackModeArticle,
			},
		},
	}
	pb := ResolvePlayback(m, ch)
	if !pb.History {
		t.Fatal("expected channel override to enable history")
	}
}
