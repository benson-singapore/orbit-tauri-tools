package server

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"
)

const maxImageProxyBytes int64 = 20 << 20 // 20 MiB

// Browser-like UA helps pass CDN hotlink / bot checks (e.g. Cloudflare on manga CDNs).
const imageProxyUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

var imageProxyClient = &http.Client{
	Timeout: 30 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return fmt.Errorf("too many redirects")
		}
		if err := validateImageProxyTarget(req.URL); err != nil {
			return err
		}
		applyImageProxyHeaders(req, req.URL)
		return nil
	},
}

func applyImageProxyHeaders(req *http.Request, target *url.URL) {
	req.Header.Set("Referer", lbupupImageReferer(target))
	req.Header.Set("User-Agent", imageProxyUserAgent)
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
}

func (s *Server) handleProxyImage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if rawURL == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("url is required"))
		return
	}

	target, err := url.Parse(rawURL)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid url"))
		return
	}
	if err := validateImageProxyTarget(target); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target.String(), nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody("create request failed"))
		return
	}
	applyImageProxyHeaders(req, target)

	resp, err := imageProxyClient.Do(req)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorBody(fmt.Sprintf("fetch image failed: %v", err)))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		writeJSON(w, http.StatusBadGateway, errorBody(fmt.Sprintf("upstream returned %d", resp.StatusCode)))
		return
	}

	limited := io.LimitReader(resp.Body, maxImageProxyBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody("read image failed"))
		return
	}
	if int64(len(body)) > maxImageProxyBytes {
		writeJSON(w, http.StatusBadGateway, errorBody("image too large"))
		return
	}

	plain, contentType, err := maybeDecryptProxyImage(target, body)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorBody(fmt.Sprintf("decrypt image failed: %v", err)))
		return
	}

	if contentType == "" || contentType == "application/octet-stream" {
		if headerCT := strings.TrimSpace(resp.Header.Get("Content-Type")); headerCT != "" {
			contentType = strings.TrimSpace(strings.Split(headerCT, ";")[0])
		}
	}
	if contentType == "" || contentType == "application/octet-stream" {
		contentType = contentTypeFromImagePath(target.Path)
	}
	if !isImageContentType(contentType) && !looksLikeImageBytes(plain) {
		writeJSON(w, http.StatusBadGateway, errorBody("upstream response is not an image"))
		return
	}
	if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
		contentType = contentTypeFromImagePath(target.Path)
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	_, _ = w.Write(plain)
}

func imageProxyReferer(target *url.URL) string {
	if target == nil {
		return ""
	}
	return target.Scheme + "://" + target.Host
}

func validateImageProxyTarget(target *url.URL) error {
	if target == nil {
		return fmt.Errorf("invalid url")
	}
	if target.Scheme != "http" && target.Scheme != "https" {
		return fmt.Errorf("url must use http or https")
	}
	host := strings.TrimSpace(target.Hostname())
	if host == "" {
		return fmt.Errorf("url host is required")
	}
	if strings.EqualFold(host, "localhost") {
		return fmt.Errorf("url host is not allowed")
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return fmt.Errorf("url host is not allowed")
		}
	}
	return nil
}

func isImageContentType(contentType string) bool {
	mediaType := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	if strings.HasPrefix(mediaType, "image/") {
		return true
	}
	switch mediaType {
	case "application/octet-stream", "binary/octet-stream":
		return true
	default:
		return false
	}
}

func looksLikeImageBytes(body []byte) bool {
	if len(body) >= 2 && body[0] == 0xFF && body[1] == 0xD8 {
		return true
	}
	if len(body) >= 8 && string(body[:8]) == "\x89PNG\r\n\x1a\n" {
		return true
	}
	if len(body) >= 6 && (string(body[:6]) == "GIF87a" || string(body[:6]) == "GIF89a") {
		return true
	}
	if len(body) >= 12 && string(body[:4]) == "RIFF" && string(body[8:12]) == "WEBP" {
		return true
	}
	return false
}

func contentTypeFromImagePath(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".bmp":
		return "image/bmp"
	case ".svg":
		return "image/svg+xml"
	case ".ico":
		return "image/x-icon"
	case ".avif":
		return "image/avif"
	default:
		return "application/octet-stream"
	}
}
