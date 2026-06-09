package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/orbit-tauri-tools/runtime/internal/plugin"
)

func (s *Server) handleFeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	q := r.URL.Query()
	pluginID := strings.TrimSpace(q.Get("plugin_id"))
	channelID := strings.TrimSpace(q.Get("channel"))
	contentType := strings.TrimSpace(q.Get("type"))
	search := strings.TrimSpace(q.Get("q"))
	limit := parsePositiveInt(q.Get("limit"), 20)
	offset := parseNonNegativeInt(q.Get("offset"), 0)
	scopePluginIDs := parseCSVPluginIDs(q.Get("plugin_ids"))

	log.Printf(
		"[orbit-feed] request plugin_id=%q channel=%q q=%q limit=%d offset=%d raw_query=%q",
		pluginID, channelID, search, limit, offset, r.URL.RawQuery,
	)

	feedResult, err := s.registry.Feed(r.Context(), pluginID, channelID, contentType, search, scopePluginIDs, limit, offset)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorBody(err.Error()))
		return
	}
	items := feedResult.Items

	type feedArticle struct {
		ID           string   `json:"id"`
		Title        string   `json:"title"`
		Summary      string   `json:"summary"`
		Type         string   `json:"type"`
		PluginID     string   `json:"pluginId"`
		PluginName   string   `json:"pluginName"`
		ChannelID    string   `json:"channelId,omitempty"`
		Author       string   `json:"author"`
		Time         string   `json:"time"`
		PublishedAt  int64    `json:"publishedAt"`
		Reads        string   `json:"reads"`
		Image        string   `json:"image,omitempty"`
		SourceURL    string   `json:"sourceUrl,omitempty"`
		Tags         []string `json:"tags"`
		IsBookmarked bool     `json:"isBookmarked"`
		IsRead       bool     `json:"isRead"`
	}

	total := feedResult.Total
	if !feedResult.PrePaged {
		total = len(items)
	}
	unreadTotal := 0
	for _, item := range items {
		if !item.IsRead {
			unreadTotal++
		}
	}
	if offset == 0 && !feedResult.PrePaged {
		if count, err := s.registry.CountUnread(r.Context(), pluginID, channelID, contentType, scopePluginIDs); err == nil {
			unreadTotal = count
		}
	}
	page := items
	if !feedResult.PrePaged {
		if offset > total {
			offset = total
		}
		end := total
		if limit > 0 && offset+limit < end {
			end = offset + limit
		}
		page = items[offset:end]
	}

	out := make([]feedArticle, 0, len(page))
	for _, item := range page {
		tags := item.Tags
		if tags == nil {
			tags = []string{}
		}
		out = append(out, feedArticle{
			ID:           item.ID,
			Title:        item.Title,
			Summary:      item.Summary,
			Type:         item.Type,
			PluginID:     item.PluginID,
			PluginName:   item.PluginName,
			ChannelID:    item.ChannelID,
			Author:       item.Author,
			Time:         item.Time,
			PublishedAt:  item.PublishedAt,
			Reads:        item.Reads,
			Image:        item.Image,
			SourceURL:    item.SourceURL,
			Tags:         tags,
			IsBookmarked: false,
			IsRead:       item.IsRead,
		})
	}

	resp := map[string]any{
		"ok":          true,
		"items":       out,
		"count":       len(out),
		"total":       total,
		"unreadTotal": unreadTotal,
		"limit":       limit,
		"offset":      offset,
	}
	if feedResult.PrePaged {
		resp["hasMore"] = feedResult.HasMore
	}
	firstID := ""
	if len(out) > 0 {
		firstID = out[0].ID
	}
	log.Printf(
		"[orbit-feed] response plugin_id=%q channel=%q prePaged=%v hasMore=%v count=%d total=%d offset=%d first_item_id=%q",
		pluginID, channelID, feedResult.PrePaged, feedResult.HasMore, len(out), total, offset, firstID,
	)
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleFeedUnread(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	q := r.URL.Query()
	pluginID := strings.TrimSpace(q.Get("plugin_id"))
	channelID := strings.TrimSpace(q.Get("channel"))
	contentType := strings.TrimSpace(q.Get("type"))
	scopePluginIDs := parseCSVPluginIDs(q.Get("plugin_ids"))

	count, err := s.registry.CountUnread(r.Context(), pluginID, channelID, contentType, scopePluginIDs)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":          true,
		"unreadTotal": count,
	})
}

func (s *Server) handleFeedItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("id is required"))
		return
	}

	item, err := s.registry.GetFeedItem(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, errorBody("feed item not found"))
			return
		}
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}

	tags := item.Tags
	if tags == nil {
		tags = []string{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true,
		"item": map[string]any{
			"id":           item.ID,
			"title":        item.Title,
			"summary":      item.Summary,
			"content":      item.Content,
			"type":         item.Type,
			"pluginId":     item.PluginID,
			"pluginName":   item.PluginName,
			"channelId":    item.ChannelID,
			"author":       item.Author,
			"time":         item.Time,
			"publishedAt":  item.PublishedAt,
			"reads":        item.Reads,
			"image":        item.Image,
			"sourceUrl":    item.SourceURL,
			"tags":         tags,
			"isBookmarked": false,
			"isRead":       item.IsRead,
		},
	})
}

func (s *Server) handleRefreshFeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	q := r.URL.Query()
	pluginID := strings.TrimSpace(q.Get("plugin_id"))
	if pluginID == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("plugin_id is required"))
		return
	}
	channelID := strings.TrimSpace(q.Get("channel"))
	force := q.Get("force") == "1" || strings.EqualFold(q.Get("force"), "true")

	var items []plugin.FeedItem
	var err error
	if force {
		items, err = s.registry.ForceRefreshPlugin(r.Context(), pluginID, channelID)
	} else {
		items, err = s.registry.RefreshPlugin(r.Context(), pluginID, channelID)
	}
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":    true,
		"count": len(items),
	})
}

func (s *Server) handleMarkFeedRead(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	var body struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid json body"))
		return
	}
	id := strings.TrimSpace(body.ID)
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("id is required"))
		return
	}

	if err := s.registry.MarkFeedItemRead(r.Context(), id); err != nil {
		if strings.Contains(err.Error(), "not found") {
			writeJSON(w, http.StatusNotFound, errorBody(err.Error()))
			return
		}
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}

func parsePositiveInt(raw string, fallback int) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func parseNonNegativeInt(raw string, fallback int) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n < 0 {
		return fallback
	}
	return n
}

func parseCSVPluginIDs(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" && p != "all" {
			out = append(out, p)
		}
	}
	return out
}
