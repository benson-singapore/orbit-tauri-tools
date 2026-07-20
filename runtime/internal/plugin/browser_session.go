package plugin

import "strings"

const BrowserSessionErrorCode = "browser_session_required"

type BrowserSessionPayload struct {
	PluginID string   `json:"pluginId"`
	Origins  []string `json:"origins"`
	Persist  []string `json:"persist"`
}

func ClassifyBrowserSessionError(rec *PluginRecord, err error) (*BrowserSessionPayload, bool) {
	if rec == nil || err == nil {
		return nil, false
	}
	cfg := rec.Config.Browser
	if !cfg.HasSessionConfig() {
		return nil, false
	}
	if !matchesBrowserFallback(err.Error(), cfg.FallbackOn) {
		return nil, false
	}
	persist := append([]string(nil), cfg.Persist...)
	if len(persist) == 0 {
		persist = []string{"cookie", "userAgent"}
	}
	return &BrowserSessionPayload{
		PluginID: rec.ID,
		Origins:  append([]string(nil), cfg.Origins...),
		Persist:  persist,
	}, true
}

func matchesBrowserFallback(msg string, fallbackOn []string) bool {
	if strings.TrimSpace(msg) == "" {
		return false
	}
	triggers := fallbackOn
	if len(triggers) == 0 {
		triggers = []string{"captcha", "http_403"}
	}
	lower := strings.ToLower(msg)
	for _, trigger := range triggers {
		switch strings.ToLower(strings.TrimSpace(trigger)) {
		case "captcha":
			if strings.HasPrefix(lower, "captcha:") ||
				strings.Contains(lower, "cloudflare") ||
				strings.Contains(lower, "cf-browser-verification") ||
				strings.Contains(lower, "just a moment") {
				return true
			}
		case "http_403":
			if strings.Contains(lower, "403") || strings.Contains(lower, "status 403") {
				return true
			}
		}
	}
	return false
}
