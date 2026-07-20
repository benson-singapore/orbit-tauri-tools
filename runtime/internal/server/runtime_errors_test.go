package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/orbit-tauri-tools/runtime/internal/plugin"
)

func TestWritePluginActionError_BrowserSession(t *testing.T) {
	rec := &plugin.PluginRecord{
		Manifest: plugin.Manifest{
			ID: "gequbao",
			Config: plugin.ManifestConfig{
				Browser: plugin.BrowserConfig{
					Purpose:    plugin.BrowserSessionPurpose,
					FallbackOn: []string{"captcha", "http_403"},
					Persist:    []string{"cookie", "userAgent"},
					Origins:    []string{"https://www.gequbao.com"},
				},
			},
		},
	}

	w := httptest.NewRecorder()
	writePluginActionError(w, http.StatusBadRequest, rec, errString("captcha: blocked by Cloudflare"))

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}

	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["code"] != plugin.BrowserSessionErrorCode {
		t.Fatalf("code = %v", body["code"])
	}
	session, ok := body["browserSession"].(map[string]any)
	if !ok {
		t.Fatalf("browserSession = %#v", body["browserSession"])
	}
	if session["pluginId"] != "gequbao" {
		t.Fatalf("pluginId = %v", session["pluginId"])
	}
}

type errString string

func (e errString) Error() string { return string(e) }

func TestBrowserConfigForView(t *testing.T) {
	if browserConfigForView(plugin.BrowserConfig{}) != nil {
		t.Fatal("expected nil for empty browser config")
	}
	view := browserConfigForView(plugin.BrowserConfig{
		Purpose: plugin.BrowserSessionPurpose,
		Origins: []string{"https://example.com"},
	})
	if view == nil || view.Purpose != plugin.BrowserSessionPurpose {
		t.Fatalf("unexpected view: %#v", view)
	}
}

func TestWritePluginActionError_Plain(t *testing.T) {
	w := httptest.NewRecorder()
	writePluginActionError(w, http.StatusBadGateway, nil, errString("network down"))
	if w.Code != http.StatusBadGateway {
		t.Fatalf("status = %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "network down") {
		t.Fatalf("body = %s", w.Body.String())
	}
}
