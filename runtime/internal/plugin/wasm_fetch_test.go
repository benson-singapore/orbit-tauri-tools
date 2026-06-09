package plugin

import (
	"encoding/json"
	"testing"
)

func TestBuildWasmFetchData_IncludesSecrets(t *testing.T) {
	rec := &PluginRecord{
		Manifest: Manifest{
			Config: ManifestConfig{
				UserAgent: "OrbitReader/1.0",
				Secrets: map[string]string{
					"apiKey": "test-youtube-key",
				},
			},
		},
	}
	ch := &FeedChannel{
		ID:    "channel-trending",
		Route: "/youtube/channel/:channelId",
		Params: map[string]string{
			"channelId": "UCDwDMPOZfxVV0x_dz0eQ8KQ",
		},
	}

	raw, err := json.Marshal(buildWasmFetchData(rec, ch))
	if err != nil {
		t.Fatal(err)
	}

	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	secrets, ok := out["secrets"].(map[string]any)
	if !ok {
		t.Fatalf("expected top-level secrets object, got %v", out["secrets"])
	}
	if secrets["apiKey"] != "test-youtube-key" {
		t.Fatalf("expected apiKey in secrets, got %v", secrets["apiKey"])
	}
	if _, hasConfig := out["config"]; hasConfig {
		t.Fatal("secrets must be top-level in fetch data, not nested under config")
	}
}
