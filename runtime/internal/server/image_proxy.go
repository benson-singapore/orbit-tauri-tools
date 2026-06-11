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

var imageProxyClient = &http.Client{
	Timeout: 30 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return fmt.Errorf("too many redirects")
		}
		if err := validateImageProxyTarget(req.URL); err != nil {
			return err
		}
		req.Header.Set("Referer", imageProxyReferer(req.URL))
		return nil
	},
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
	req.Header.Set("Referer", imageProxyReferer(target))
	req.Header.Set("User-Agent", "OrbitReader/1.0")

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

	contentType := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = contentTypeFromImagePath(target.Path)
	}
	if !isImageContentType(contentType) {
		writeJSON(w, http.StatusBadGateway, errorBody("upstream response is not an image"))
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400")

	limited := io.LimitReader(resp.Body, maxImageProxyBytes+1)
	written, err := io.Copy(w, limited)
	if err != nil {
		return
	}
	if written > maxImageProxyBytes {
		return
	}
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
	return mediaType == "application/octet-stream"
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
