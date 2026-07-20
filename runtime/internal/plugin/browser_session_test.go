package plugin

import "testing"

func TestClassifyBrowserSessionError(t *testing.T) {
	rec := &PluginRecord{
		Manifest: Manifest{
			ID: "gequbao",
			Config: ManifestConfig{
				Browser: BrowserConfig{
					Purpose:    BrowserSessionPurpose,
					FallbackOn: []string{"captcha", "http_403"},
					Persist:    []string{"cookie", "userAgent"},
					Origins:    []string{"https://www.gequbao.com"},
				},
			},
		},
	}

	payload, ok := ClassifyBrowserSessionError(rec, errString("captcha: channel page blocked by Cloudflare"))
	if !ok || payload == nil {
		t.Fatal("expected browser session classification for captcha error")
	}
	if payload.PluginID != "gequbao" {
		t.Fatalf("pluginId = %q, want gequbao", payload.PluginID)
	}
	if len(payload.Origins) != 1 || payload.Origins[0] != "https://www.gequbao.com" {
		t.Fatalf("origins = %#v", payload.Origins)
	}

	_, ok = ClassifyBrowserSessionError(rec, errString("network timeout"))
	if ok {
		t.Fatal("expected no classification for unrelated error")
	}

	plain := &PluginRecord{Manifest: Manifest{ID: "rss", Config: ManifestConfig{}}}
	_, ok = ClassifyBrowserSessionError(plain, errString("captcha: blocked"))
	if ok {
		t.Fatal("expected no classification without browser session config")
	}
}

type errString string

func (e errString) Error() string { return string(e) }
