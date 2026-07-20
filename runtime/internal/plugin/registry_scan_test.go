package plugin

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestScanDirSkipsInvalidPlugin(t *testing.T) {
	root := t.TempDir()
	writeScanManifest(t, root, "broken", `{"id":"broken","name":"Broken","version":"1.0.0","mediaType":"audio","source":"wasm","capabilities":["feed"],"config":{"channels":[{"id":"all","label":"All","route":"list"}],"wasm":{"entry":"plugin.wasm"}}}`)
	writeScanManifest(t, root, "valid", `{"id":"valid","name":"Valid","version":"1.0.0","mediaType":"audio","source":"wasm","capabilities":["feed"],"config":{"channels":[{"id":"all","label":"All","route":"list"}],"wasm":{"entry":"plugin.wasm"}}}`)
	if err := os.WriteFile(filepath.Join(root, "valid", "plugin.wasm"), []byte("wasm"), 0o644); err != nil {
		t.Fatal(err)
	}

	disk := make(map[string]manifestOnDisk)
	if err := (&Registry{}).scanDir(root, disk); err != nil {
		t.Fatal(err)
	}
	if _, ok := disk["broken"]; ok {
		t.Fatal("broken plugin was not skipped")
	}
	if _, ok := disk["valid"]; !ok {
		t.Fatal("valid plugin was skipped")
	}
}

func writeScanManifest(t *testing.T, root, id, raw string) {
	t.Helper()
	dir := filepath.Join(root, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	var manifest map[string]any
	if err := json.Unmarshal([]byte(raw), &manifest); err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), data, 0o644); err != nil {
		t.Fatal(err)
	}
}
