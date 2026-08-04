package plugin

import "testing"

func TestShouldUseWebviewHTTP_OnlySessionConfig(t *testing.T) {
	t.Setenv("ORBIT_WEBVIEW_HTTP_ADDR", "127.0.0.1:9")

	cookieOnly := &PluginRecord{
		Manifest: Manifest{
			ID: "unsplash",
			Config: ManifestConfig{
				Variables: map[string]VariableDefinition{
					"cookie": {Label: "Cookie", Required: true, Secret: true},
				},
			},
		},
	}
	if shouldUseWebviewHTTP(cookieOnly, map[string]string{"cookie": "a=b"}) {
		t.Fatal("cookie-only plugin must use direct HTTP, not webview/captcha path")
	}

	session := &PluginRecord{
		Manifest: Manifest{
			ID: "gequbao",
			Config: ManifestConfig{
				Browser: BrowserConfig{
					Purpose: BrowserSessionPurpose,
					Origins: []string{"https://www.gequbao.com"},
				},
			},
		},
	}
	if !shouldUseWebviewHTTP(session, nil) {
		t.Fatal("browser session plugin should use webview HTTP when transport is available")
	}
}
