package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/orbit-tauri-tools/runtime/internal/plugin"
	"github.com/orbit-tauri-tools/runtime/internal/store"
)

const Version = "0.1.0"

type Server struct {
	store    *store.Store
	registry *plugin.Registry
	mux      *http.ServeMux
	imgbb    *imgbbService
}

func New(st *store.Store, reg *plugin.Registry) *Server {
	s := &Server{
		store:    st,
		registry: reg,
		mux:      http.NewServeMux(),
		imgbb:    newImgbbService(),
	}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		s.mux.ServeHTTP(w, r)
	})
}

func (s *Server) routes() {
	s.mux.HandleFunc("/health", s.handleHealth)
	s.mux.HandleFunc("/v1/status", s.handleStatus)
	s.mux.HandleFunc("/v1/plugins", s.handlePlugins)
	s.mux.HandleFunc("/v1/plugins/", s.handlePluginByID)
	s.mux.HandleFunc("/v1/feed", s.handleFeed)
	s.mux.HandleFunc("/v1/feed/refresh", s.handleRefreshFeed)
	s.mux.HandleFunc("/v1/images/upload", s.handleUploadImage)
	s.mux.HandleFunc("/v1/images/upload-url", s.handleUploadImageByURL)
	s.mux.HandleFunc("/openapi.json", s.handleOpenAPI)
	s.mux.HandleFunc("/swagger", s.handleSwaggerRedirect)
	s.mux.HandleFunc("/swagger/", s.handleSwaggerUI)
}

func (s *Server) handlePlugins(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.handleListPlugins(w, r)
	case http.MethodPost:
		s.handleInstallPlugin(w, r)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"version": Version,
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	dbState := "ready"
	if s.store == nil || s.store.DB == nil {
		dbState = "unavailable"
	} else if err := s.store.DB.Ping(); err != nil {
		dbState = "error"
	}

	sqlitePath := ""
	if s.store != nil {
		sqlitePath = s.store.Path
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":          dbState == "ready",
		"runtime":     Version,
		"db":          dbState,
		"sqlite_path": sqlitePath,
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

// ReadyLine formats the stdout handshake line for Tauri.
func ReadyLine(port int) string {
	return strings.TrimSpace("ORBIT_READY port=" + itoa(port))
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
