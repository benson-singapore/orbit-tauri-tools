package server

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/orbit-tauri-tools/runtime/internal/plugin"
)

func (s *Server) handleListPlugins(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plugins": pluginRecordsToViews(s.registry.List())})
}

type pluginView struct {
	ID              string               `json:"id"`
	Name            string               `json:"name"`
	Icon            string               `json:"icon"`
	MediaType       string               `json:"mediaType,omitempty"`
	Active          bool                 `json:"active"`
	Desc            string               `json:"desc"`
	Channels        []plugin.FeedChannel `json:"channels"`
	DefaultChannel  string               `json:"defaultChannel,omitempty"`
	RefreshInterval int                  `json:"refreshInterval,omitempty"`
	UserAgent       string               `json:"userAgent,omitempty"`
	LogoText        string               `json:"logoText,omitempty"`
	LogoImageURL    string               `json:"logoImageUrl,omitempty"`
	Color           string               `json:"color"`
	MarketCategory  string               `json:"marketCategory,omitempty"`
	CategoryTag     string               `json:"categoryTag,omitempty"`
	Official        bool                 `json:"official,omitempty"`
	Source          string               `json:"source"`
	LastError       string               `json:"lastError,omitempty"`
}

func pluginRecordToView(rec *plugin.PluginRecord) pluginView {
	icon := rec.Meta.Icon
	if strings.TrimSpace(icon) == "" {
		icon = plugin.ContentTypeForMedia(rec.MediaType)
	}
	return pluginView{
		ID:              rec.ID,
		Name:            rec.Name,
		Icon:            icon,
		MediaType:       rec.MediaType,
		Active:          rec.Active,
		Desc:            rec.Meta.Description,
		Channels:        rec.Config.Channels,
		DefaultChannel:  rec.Config.DefaultChannel,
		RefreshInterval: rec.Config.RefreshInterval,
		UserAgent:       rec.Config.UserAgent,
		LogoText:        rec.Meta.LogoText,
		LogoImageURL:    rec.Meta.LogoImageURL,
		Color:           rec.Meta.Color,
		MarketCategory:  rec.Meta.MarketCategory,
		CategoryTag:     rec.Meta.CategoryTag,
		Official:        rec.Meta.Official,
		Source:          rec.Source,
		LastError:       rec.LastError,
	}
}

func pluginRecordsToViews(recs []*plugin.PluginRecord) []pluginView {
	out := make([]pluginView, 0, len(recs))
	for _, rec := range recs {
		out = append(out, pluginRecordToView(rec))
	}
	return out
}

func (s *Server) handlePluginAsset(w http.ResponseWriter, r *http.Request, rest string) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	parts := strings.SplitN(rest, "/assets/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		writeJSON(w, http.StatusNotFound, errorBody("not found"))
		return
	}
	path, err := s.registry.PluginAssetPath(parts[0], parts[1])
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorBody(err.Error()))
		return
	}
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".png":
		w.Header().Set("Content-Type", "image/png")
	case ".jpg", ".jpeg":
		w.Header().Set("Content-Type", "image/jpeg")
	case ".svg":
		w.Header().Set("Content-Type", "image/svg+xml")
	case ".webp":
		w.Header().Set("Content-Type", "image/webp")
	default:
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	http.ServeFile(w, r, path)
}

func (s *Server) handleInstallPlugin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	var body struct {
		Source          string               `json:"source"`
		FeedURL         string               `json:"feedUrl"`
		Channels        []plugin.FeedChannel `json:"channels"`
		DefaultChannel  string               `json:"defaultChannel"`
		Name            string               `json:"name"`
		ID              string               `json:"id"`
		MediaType       string               `json:"mediaType"`
		RefreshInterval int                  `json:"refreshInterval"`
		UserAgent       string               `json:"userAgent"`
		Icon            string               `json:"icon"`
		Description     string               `json:"description"`
		Color           string               `json:"color"`
		LogoText        string               `json:"logoText"`
		LogoImageURL    string               `json:"logoImageUrl"`
		MarketCategory  string               `json:"marketCategory"`
		CategoryTag     string               `json:"categoryTag"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid JSON body"))
		return
	}
	if body.Source == "" {
		body.Source = plugin.SourceRSS
	}
	if body.Source != plugin.SourceRSS {
		writeJSON(w, http.StatusBadRequest, errorBody("only rss plugins can be installed via API for now"))
		return
	}

	rec, err := s.registry.InstallRSS(r.Context(), plugin.InstallRSSOptions{
		ID:              body.ID,
		Name:            body.Name,
		Channels:        body.Channels,
		FeedURL:         body.FeedURL,
		DefaultChannel:  body.DefaultChannel,
		MediaType:       body.MediaType,
		RefreshInterval: body.RefreshInterval,
		UserAgent:       body.UserAgent,
		Icon:            body.Icon,
		Description:     body.Description,
		Color:           body.Color,
		LogoText:        body.LogoText,
		LogoImageURL:    body.LogoImageURL,
		MarketCategory:  body.MarketCategory,
		CategoryTag:     body.CategoryTag,
	})
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"plugin": rec})
}

func (s *Server) handlePluginsMarket(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	recs := s.registry.ListMarketPlugins()
	writeJSON(w, http.StatusOK, map[string]any{"plugins": pluginRecordsToViews(recs)})
}

func (s *Server) handlePluginsResync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	if err := s.registry.Sync(r.Context()); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handlePluginByID(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/v1/plugins/")
	if rest == "" {
		writeJSON(w, http.StatusNotFound, errorBody("not found"))
		return
	}

	if strings.Contains(rest, "/assets/") {
		s.handlePluginAsset(w, r, rest)
		return
	}

	if strings.HasSuffix(rest, "/install") && r.Method == http.MethodPost {
		id := strings.TrimSuffix(rest, "/install")
		id = strings.TrimSuffix(id, "/")
		rec, err := s.registry.InstallBundled(r.Context(), id)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"plugin": pluginRecordToView(rec)})
		return
	}

	if strings.Contains(rest, "/") {
		writeJSON(w, http.StatusNotFound, errorBody("not found"))
		return
	}
	id := rest

	switch r.Method {
	case http.MethodPatch:
		var body struct {
			Active *bool `json:"active"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, errorBody("invalid JSON body"))
			return
		}
		if body.Active == nil {
			writeJSON(w, http.StatusBadRequest, errorBody("active is required"))
			return
		}
		rec, err := s.registry.SetActive(r.Context(), id, *body.Active)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"plugin": rec})

	case http.MethodDelete:
		if err := s.registry.Uninstall(r.Context(), id); err != nil {
			writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})

	default:
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
	}
}

func errorBody(msg string) map[string]any {
	return map[string]any{"ok": false, "error": msg}
}
