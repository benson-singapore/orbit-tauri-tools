package server

import (
	"net/http"
	"strings"
)

func (s *Server) handleFeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	q := r.URL.Query()
	pluginID := strings.TrimSpace(q.Get("plugin_id"))
	refresh := q.Get("refresh") == "1" || strings.EqualFold(q.Get("refresh"), "true")

	items, err := s.registry.Feed(r.Context(), pluginID, refresh)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorBody(err.Error()))
		return
	}

	type feedArticle struct {
		ID           string   `json:"id"`
		Title        string   `json:"title"`
		Summary      string   `json:"summary"`
		Content      string   `json:"content"`
		Type         string   `json:"type"`
		PluginID     string   `json:"pluginId"`
		PluginName   string   `json:"pluginName"`
		Author       string   `json:"author"`
		Time         string   `json:"time"`
		PublishedAt  int64    `json:"publishedAt"`
		Reads        string   `json:"reads"`
		Image        string   `json:"image,omitempty"`
		SourceURL    string   `json:"sourceUrl,omitempty"`
		Tags         []string `json:"tags"`
		IsBookmarked bool     `json:"isBookmarked"`
	}

	out := make([]feedArticle, 0, len(items))
	for _, item := range items {
		out = append(out, feedArticle{
			ID:           item.ID,
			Title:        item.Title,
			Summary:      item.Summary,
			Content:      item.Content,
			Type:         item.Type,
			PluginID:     item.PluginID,
			PluginName:   item.PluginName,
			Author:       item.Author,
			Time:         item.Time,
			PublishedAt:  item.PublishedAt,
			Reads:        item.Reads,
			Image:        item.Image,
			SourceURL:    item.SourceURL,
			Tags:         item.Tags,
			IsBookmarked: false,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":    true,
		"items": out,
		"count": len(out),
	})
}

func (s *Server) handleRefreshFeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	pluginID := strings.TrimSpace(r.URL.Query().Get("plugin_id"))
	if pluginID == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("plugin_id is required"))
		return
	}

	items, err := s.registry.RefreshPlugin(r.Context(), pluginID)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":    true,
		"count": len(items),
	})
}
