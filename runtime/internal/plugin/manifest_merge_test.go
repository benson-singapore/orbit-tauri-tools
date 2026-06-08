package plugin

import (
	"encoding/json"
	"testing"
)

func TestMergeManifestForUpdate_PreservesUserConfig(t *testing.T) {
	existing := []byte(`{
  "id": "juejin",
  "name": "掘金",
  "version": "1.0.0",
  "config": {
    "channels": [{"id": "custom", "label": "我的频道"}],
    "refreshInterval": 999
  },
  "meta": {"description": "old desc"}
}`)
	incoming := []byte(`{
  "id": "juejin",
  "name": "掘金",
  "version": "1.0.1",
  "config": {
    "channels": [{"id": "trending", "label": "热榜"}],
    "refreshInterval": 1800,
    "wasm": {"entry": "main.wasm.br", "timeoutMs": 120000}
  },
  "meta": {"description": "new desc", "official": true}
}`)

	merged, err := mergeManifestForUpdate(existing, incoming)
	if err != nil {
		t.Fatalf("mergeManifestForUpdate: %v", err)
	}

	var out map[string]any
	if err := json.Unmarshal(merged, &out); err != nil {
		t.Fatalf("unmarshal merged: %v", err)
	}
	if out["version"] != "1.0.1" {
		t.Fatalf("expected version 1.0.1, got %v", out["version"])
	}

	config := out["config"].(map[string]any)
	if config["refreshInterval"].(float64) != 999 {
		t.Fatalf("expected preserved refreshInterval 999, got %v", config["refreshInterval"])
	}
	channels := config["channels"].([]any)
	if len(channels) != 1 {
		t.Fatalf("expected preserved channels, got %v", channels)
	}
	if _, ok := config["wasm"]; !ok {
		t.Fatal("expected wasm config to be inserted from incoming")
	}

	meta := out["meta"].(map[string]any)
	if meta["description"] != "old desc" {
		t.Fatalf("expected preserved description, got %v", meta["description"])
	}
	if meta["official"] != true {
		t.Fatal("expected official to be inserted from incoming")
	}
}
