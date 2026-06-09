package plugin

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestYouTubeWasmFetchChannelManual(t *testing.T) {
	if os.Getenv("RUN_YOUTUBE_WASM") != "1" {
		t.Skip("set RUN_YOUTUBE_WASM=1 to run live youtube wasm fetch")
	}

	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(home, "Library", "Application Support", "Orbit Reader", "plugins", "youtube")
	m, err := LoadManifest(filepath.Join(root, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	rec := &PluginRecord{Manifest: *m, Active: true}
	ch := &m.Config.Channels[0]

	exec := NewWASMExecutor()
	items, err := exec.FetchChannel(context.Background(), root, rec, ch)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) == 0 {
		t.Fatal("expected at least one feed item")
	}
	t.Logf("items: %d, first: %q", len(items), items[0].Title)
}
