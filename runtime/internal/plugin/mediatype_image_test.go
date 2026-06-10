package plugin_test

import (
	"testing"
	"github.com/orbit-tauri-tools/runtime/internal/plugin"
)

func TestMediaTypeImageManifest(t *testing.T) {
	raw := `{"id":"1x","name":"1x.com","version":"1.0.0","mediaType":"image","source":"wasm","capabilities":["feed"],"config":{"channels":[{"id":"latest-awarded","label":"Latest Awarded","params":{"category":"latest/awarded"},"route":"/1x/:category","status":"enabled"}],"defaultChannel":"latest-awarded","executionMode":"wasm","refreshInterval":3600,"wasm":{"entry":"main.wasm.br","maxMemoryMB":64,"timeoutMs":120000}},"meta":{"categoryTag":"PHOTO","color":"bg-gray-900","description":"test","icon":"image","marketCategory":"photo"}}`
	m, err := plugin.ParseManifestBytes([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if m.MediaType != plugin.MediaImage {
		t.Fatalf("mediaType = %q, want %q", m.MediaType, plugin.MediaImage)
	}
	if got := plugin.ContentTypeForMedia(m.MediaType); got != "image" {
		t.Fatalf("content type = %q, want image", got)
	}
}
