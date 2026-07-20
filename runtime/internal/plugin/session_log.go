package plugin

import (
	"fmt"
	"log"
	"strings"
)

func describeCookieHeader(cookie string) string {
	cookie = strings.TrimSpace(cookie)
	if cookie == "" {
		return "empty"
	}
	names := make([]string, 0, 4)
	for _, part := range strings.Split(cookie, ";") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		name, _, _ := strings.Cut(part, "=")
		name = strings.TrimSpace(name)
		if name != "" {
			names = append(names, name)
		}
	}
	return fmt.Sprintf(
		"len=%d names=[%s] has_cf_clearance=%v",
		len(cookie),
		strings.Join(names, ","),
		strings.Contains(cookie, "cf_clearance="),
	)
}

func describeUserAgent(ua string) string {
	ua = strings.TrimSpace(ua)
	if ua == "" {
		return "empty"
	}
	if len(ua) <= 80 {
		return ua
	}
	return ua[:77] + "..."
}

func logPluginVars(pluginID string, vars map[string]string) {
	if len(vars) == 0 {
		log.Printf("[orbit-session] plugin=%q vars=empty", pluginID)
		return
	}
	keys := make([]string, 0, len(vars))
	for key := range vars {
		keys = append(keys, key)
	}
	log.Printf(
		"[orbit-session] plugin=%q var_keys=%v cookie=%s user_agent=%s",
		pluginID,
		keys,
		describeCookieHeader(vars["cookie"]),
		describeUserAgent(vars["userAgent"]),
	)
}

func logHTTPRequest(pluginID, method, url, cookie, ua string) {
	log.Printf(
		"[orbit-http] plugin=%q %s %s cookie=%s user_agent=%s",
		pluginID,
		method,
		url,
		describeCookieHeader(cookie),
		describeUserAgent(ua),
	)
}
