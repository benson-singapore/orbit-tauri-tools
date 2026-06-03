package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/orbit-tauri-tools/runtime/internal/plugin"
)

func (s *Server) handleListPlugins(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	recs := s.registry.List()
	// Frontend expects Plugin-like objects.
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
	out := make([]pluginView, 0, len(recs))
	for _, rec := range recs {
		icon := rec.Meta.Icon
		if strings.TrimSpace(icon) == "" {
			icon = plugin.ContentTypeForMedia(rec.MediaType)
		}
		out = append(out, pluginView{
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
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"plugins": out})
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

func (s *Server) handlePluginByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/v1/plugins/")
	if id == "" || strings.Contains(id, "/") {
		writeJSON(w, http.StatusNotFound, errorBody("not found"))
		return
	}

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
