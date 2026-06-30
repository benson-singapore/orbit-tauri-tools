package plugin_test

import (
	"testing"

	"github.com/orbit-tauri-tools/runtime/internal/plugin"
)

func TestMediaTypeNovelManifest(t *testing.T) {
	raw := `{"id":"novel-test","name":"Novel Test","version":"1.0.1","mediaType":"novel","source":"wasm","capabilities":["feed"],"config":{"channels":[{"id":"all","label":"All","route":"list","status":"enabled"}],"defaultChannel":"all","executionMode":"wasm","refreshInterval":3600,"wasm":{"entry":"main.wasm.br","maxMemoryMB":64,"timeoutMs":120000}},"meta":{"categoryTag":"NOVEL","color":"bg-purple-600","description":"test","icon":"text","marketCategory":"blog"}}`
	m, err := plugin.ParseManifestBytes([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if m.MediaType != plugin.MediaNovel {
		t.Fatalf("mediaType = %q, want %q", m.MediaType, plugin.MediaNovel)
	}
	if got := plugin.DefaultPlaybackMode(m.MediaType); got != plugin.PlaybackModeArticle {
		t.Fatalf("playback mode = %q, want %q", got, plugin.PlaybackModeArticle)
	}
	if got := plugin.DefaultIncludeInAll(m.MediaType, ""); !got {
		t.Fatalf("DefaultIncludeInAll(%q) = false, want true", m.MediaType)
	}
	if got := plugin.ContentTypeForMedia(m.MediaType); got != "text" {
		t.Fatalf("content type = %q, want text", got)
	}
}
