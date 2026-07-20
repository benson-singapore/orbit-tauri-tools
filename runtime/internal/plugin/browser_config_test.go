package plugin

import (
	"encoding/json"
	"testing"
)

func TestBrowserConfigRoundTrip(t *testing.T) {
	raw := `{
  "id": "gequbao",
  "name": "歌曲宝",
  "version": "1.0.0",
  "mediaType": "audio",
  "source": "wasm",
  "capabilities": ["feed"],
  "config": {
    "refreshInterval": 3600,
    "executionMode": "wasm",
    "browser": {
      "purpose": "session",
      "required": false,
      "fallbackOn": ["captcha", "http_403"],
      "persist": ["cookie", "userAgent"],
      "origins": ["https://www.gequbao.com"]
    },
    "channels": [{
      "id": "hot-music",
      "label": "热门推荐",
      "route": "/gequbao/channel",
      "params": {"url": "https://www.gequbao.com/hot-music"},
      "features": {"feed": {}}
    }],
    "wasm": {"entry": "plugin.wasm"}
  },
  "meta": {
    "description": "test",
    "icon": "music",
    "color": "bg-emerald-600"
  }
}`

	m, err := ParseManifestBytes([]byte(raw))
	if err != nil {
		t.Fatalf("ParseManifestBytes: %v", err)
	}
	browser := m.Config.Browser
	if browser.Purpose != BrowserSessionPurpose {
		t.Fatalf("purpose = %q", browser.Purpose)
	}
	if len(browser.Origins) != 1 || browser.Origins[0] != "https://www.gequbao.com" {
		t.Fatalf("origins = %#v", browser.Origins)
	}
	if len(browser.Persist) != 2 || browser.Persist[0] != "cookie" {
		t.Fatalf("persist = %#v", browser.Persist)
	}
	if len(browser.FallbackOn) != 2 {
		t.Fatalf("fallbackOn = %#v", browser.FallbackOn)
	}

	persisted := manifestForPersistence(*m)
	data, err := json.Marshal(persisted)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded Manifest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	got := decoded.Config.Browser
	if got.Purpose != BrowserSessionPurpose {
		t.Fatalf("round-trip purpose = %q", got.Purpose)
	}
	if len(got.Origins) != 1 || got.Origins[0] != "https://www.gequbao.com" {
		t.Fatalf("round-trip origins = %#v", got.Origins)
	}
	if len(got.Persist) != 2 {
		t.Fatalf("round-trip persist = %#v", got.Persist)
	}
	if len(got.FallbackOn) != 2 {
		t.Fatalf("round-trip fallbackOn = %#v", got.FallbackOn)
	}
}
