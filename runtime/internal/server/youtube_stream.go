package server

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/kkdai/youtube/v2"
)

const youtubeStreamUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

type youtubeStreamEntry struct {
	url       string
	quality   string
	expiresAt time.Time
}

var (
	youtubeStreamCacheMu sync.Mutex
	youtubeStreamCache   = map[string]youtubeStreamEntry{}
	youtubeStreamClient  = &http.Client{Timeout: 0}
	youtubeAPIClient     = youtube.Client{}
)

func (s *Server) handleYouTubeStreamInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	videoID := strings.TrimSpace(r.URL.Query().Get("v"))
	if !youtubeVideoIDPattern.MatchString(videoID) {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid video id"))
		return
	}

	entry, err := resolveYouTubeStreamEntry(videoID)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorBody(err.Error()))
		return
	}

	playURL := fmt.Sprintf("http://%s/v1/youtube/play?v=%s", r.Host, videoID)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"videoId":   videoID,
		"quality":   entry.quality,
		"streamUrl": playURL,
	})
}

func (s *Server) handleYouTubePlay(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	videoID := strings.TrimSpace(r.URL.Query().Get("v"))
	if !youtubeVideoIDPattern.MatchString(videoID) {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid video id"))
		return
	}

	entry, err := resolveYouTubeStreamEntry(videoID)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorBody(err.Error()))
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), r.Method, entry.url, nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody("create upstream request failed"))
		return
	}
	applyYouTubeStreamHeaders(req)
	if rangeHeader := r.Header.Get("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	resp, err := youtubeStreamClient.Do(req)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorBody(fmt.Sprintf("upstream stream failed: %v", err)))
		return
	}
	defer resp.Body.Close()

	copyHeader := w.Header()
	for key, values := range resp.Header {
		lower := strings.ToLower(key)
		if lower == "transfer-encoding" || lower == "connection" {
			continue
		}
		for _, value := range values {
			copyHeader.Add(key, value)
		}
	}
	copyHeader.Set("Access-Control-Allow-Origin", "*")
	copyHeader.Set("Accept-Ranges", "bytes")
	w.WriteHeader(resp.StatusCode)

	if r.Method == http.MethodHead {
		return
	}

	_, _ = io.Copy(w, resp.Body)
}

func applyYouTubeStreamHeaders(req *http.Request) {
	req.Header.Set("Referer", "https://www.youtube.com/")
	req.Header.Set("Origin", "https://www.youtube.com")
	req.Header.Set("User-Agent", youtubeStreamUserAgent)
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
}

func resolveYouTubeStreamEntry(videoID string) (youtubeStreamEntry, error) {
	youtubeStreamCacheMu.Lock()
	if entry, ok := youtubeStreamCache[videoID]; ok && time.Now().Before(entry.expiresAt) {
		youtubeStreamCacheMu.Unlock()
		return entry, nil
	}
	youtubeStreamCacheMu.Unlock()

	video, err := youtubeAPIClient.GetVideo(videoID)
	if err != nil {
		return youtubeStreamEntry{}, fmt.Errorf("resolve youtube video failed: %w", err)
	}

	formats := video.Formats.WithAudioChannels().Type("video/mp4")
	if len(formats) == 0 {
		formats = video.Formats.WithAudioChannels()
	}
	if len(formats) == 0 {
		return youtubeStreamEntry{}, fmt.Errorf("no playable formats for video %s", videoID)
	}
	formats.Sort()

	var lastErr error
	for i := len(formats) - 1; i >= 0; i-- {
		format := formats[i]
		streamURL, err := youtubeAPIClient.GetStreamURL(video, &format)
		if err != nil {
			lastErr = err
			continue
		}
		entry := youtubeStreamEntry{
			url:       streamURL,
			quality:   strings.TrimSpace(format.QualityLabel),
			expiresAt: time.Now().Add(45 * time.Minute),
		}
		if entry.quality == "" {
			entry.quality = "auto"
		}

		youtubeStreamCacheMu.Lock()
		youtubeStreamCache[videoID] = entry
		youtubeStreamCacheMu.Unlock()
		return entry, nil
	}

	if lastErr != nil {
		return youtubeStreamEntry{}, fmt.Errorf("resolve stream url failed: %w", lastErr)
	}
	return youtubeStreamEntry{}, fmt.Errorf("resolve stream url failed")
}
