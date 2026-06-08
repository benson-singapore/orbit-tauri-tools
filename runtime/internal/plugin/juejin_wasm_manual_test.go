package plugin

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestJuejinWasmFetchChannelManual(t *testing.T) {
	if os.Getenv("RUN_JUEJIN_WASM") != "1" {
		t.Skip("set RUN_JUEJIN_WASM=1 to run live juejin wasm fetch")
	}

	root := filepath.Join("..", "..", "..", "docs", "插件", "掘金", "掘金")
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
	t.Logf("items: %d", len(items))
	for i, it := range items {
		if i >= 3 {
			break
		}
		t.Logf("[%d] title=%q summary=%d content=%d url=%q", i, it.Title, len(it.Summary), len(it.Content), it.SourceURL)
	}
	sample := items
	if len(sample) > 2 {
		sample = sample[:2]
	}
	data, _ := json.MarshalIndent(sample, "", "  ")
	t.Log(string(data))
}
