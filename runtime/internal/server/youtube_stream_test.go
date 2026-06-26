package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleYouTubeStreamInfoRejectsInvalidID(t *testing.T) {
	t.Parallel()

	s := &Server{mux: http.NewServeMux()}
	s.mux.HandleFunc("/v1/youtube/stream", s.handleYouTubeStreamInfo)

	req := httptest.NewRequest(http.MethodGet, "/v1/youtube/stream?v=bad", nil)
	rec := httptest.NewRecorder()
	s.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
