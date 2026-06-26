package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleYouTubeEmbed(t *testing.T) {
	t.Parallel()

	s := &Server{mux: http.NewServeMux()}
	s.mux.HandleFunc("/v1/embed/youtube", s.handleYouTubeEmbed)

	req := httptest.NewRequest(http.MethodGet, "/v1/embed/youtube?v=dQw4w9WgXcQ&jsapi=1&start=42&title=Test+Video", nil)
	rec := httptest.NewRecorder()
	s.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "https://www.youtube.com/embed/dQw4w9WgXcQ") {
		t.Fatalf("missing youtube embed url: %s", body)
	}
	if !strings.Contains(body, "enablejsapi=1") {
		t.Fatalf("missing enablejsapi param: %s", body)
	}
	if !strings.Contains(body, "start=42") {
		t.Fatalf("missing start param: %s", body)
	}
	if !strings.Contains(body, `title="Test Video"`) {
		t.Fatalf("missing escaped title: %s", body)
	}
}

func TestHandleYouTubeEmbedRejectsInvalidID(t *testing.T) {
	t.Parallel()

	s := &Server{mux: http.NewServeMux()}
	s.mux.HandleFunc("/v1/embed/youtube", s.handleYouTubeEmbed)

	req := httptest.NewRequest(http.MethodGet, "/v1/embed/youtube?v=bad", nil)
	rec := httptest.NewRecorder()
	s.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
