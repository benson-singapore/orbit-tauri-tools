package plugin

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

type webviewHTTPRequest struct {
	PluginID string            `json:"pluginId"`
	Method   string            `json:"method"`
	URL      string            `json:"url"`
	Headers  map[string]string `json:"headers"`
	Body     string            `json:"body,omitempty"`
}

type webviewHTTPResponse struct {
	Status      int    `json:"status"`
	ContentType string `json:"contentType"`
	BodyBase64  string `json:"bodyBase64"`
	Error       string `json:"error,omitempty"`
}

func webviewHTTPAddrFile() string {
	port := strings.TrimSpace(os.Getenv("ORBIT_PORT"))
	if port == "" {
		port = "17890"
	}
	return filepath.Join(os.TempDir(), fmt.Sprintf("orbit-webview-http-%s.addr", port))
}

func webviewHTTPAddr() string {
	if v := strings.TrimSpace(os.Getenv("ORBIT_WEBVIEW_HTTP_ADDR")); v != "" {
		return v
	}
	data, err := os.ReadFile(webviewHTTPAddrFile())
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func shouldUseWebviewHTTP(rec *PluginRecord, vars map[string]string) bool {
	if !webviewHTTPAvailable() {
		return false
	}
	if rec == nil {
		return false
	}
	if rec.Config.Browser.HasSessionConfig() {
		return true
	}
	if _, ok := rec.Config.Variables["cookie"]; ok {
		return true
	}
	if vars != nil && strings.TrimSpace(vars["cookie"]) != "" {
		return true
	}
	return false
}

func webviewHTTPAvailable() bool {
	return webviewHTTPAddr() != ""
}

func doWebviewHTTP(
	ctx context.Context,
	pluginID, method, url, body string,
	headers map[string]string,
) (hostHTTPResponse, error) {
	addr := webviewHTTPAddr()
	if addr == "" {
		return hostHTTPResponse{}, fmt.Errorf("webview http unavailable")
	}

	req := webviewHTTPRequest{
		PluginID: pluginID,
		Method:   method,
		URL:      url,
		Headers:  headers,
		Body:     body,
	}
	payload, err := json.Marshal(req)
	if err != nil {
		return hostHTTPResponse{}, err
	}

	dialer := net.Dialer{Timeout: 5 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return hostHTTPResponse{}, fmt.Errorf("webview http dial: %w", err)
	}
	defer conn.Close()

	deadline := time.Now().Add(120 * time.Second)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	_ = conn.SetDeadline(deadline)

	if _, err := conn.Write(append(payload, '\n')); err != nil {
		return hostHTTPResponse{}, fmt.Errorf("webview http write: %w", err)
	}

	line, err := bufio.NewReader(conn).ReadString('\n')
	if err != nil {
		return hostHTTPResponse{}, fmt.Errorf("webview http read: %w", err)
	}

	var resp webviewHTTPResponse
	if err := json.Unmarshal([]byte(strings.TrimSpace(line)), &resp); err != nil {
		return hostHTTPResponse{}, fmt.Errorf("webview http parse: %w", err)
	}
	if resp.Error != "" {
		return hostHTTPResponse{}, fmt.Errorf("%s", resp.Error)
	}

	out := hostHTTPResponse{Status: resp.Status}
	if resp.ContentType != "" {
		out.Headers = map[string]string{"Content-Type": resp.ContentType}
	}
	if resp.BodyBase64 != "" {
		if isHTMLHTTPContentType(resp.ContentType) || !utf8ValidBase64Text(resp.BodyBase64) {
			out.BodyBase64 = resp.BodyBase64
		} else {
			raw, err := base64.StdEncoding.DecodeString(resp.BodyBase64)
			if err != nil {
				out.BodyBase64 = resp.BodyBase64
			} else if utf8ValidBytes(raw) {
				out.Body = string(raw)
			} else {
				out.BodyBase64 = resp.BodyBase64
			}
		}
	}

	log.Printf(
		"[orbit-webview-http] plugin=%q %s %s status=%d content_type=%q body_len=%d",
		pluginID,
		method,
		url,
		resp.Status,
		resp.ContentType,
		len(resp.BodyBase64),
	)
	return out, nil
}

func utf8ValidBase64Text(encoded string) bool {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return false
	}
	return utf8ValidBytes(raw)
}

func utf8ValidBytes(b []byte) bool {
	return utf8.Valid(b)
}
