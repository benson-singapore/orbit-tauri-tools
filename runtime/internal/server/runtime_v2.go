package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/orbit-tauri-tools/runtime/internal/plugin"
)

func (s *Server) handleRuntimeV2(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v2/runtime/")
	switch path {
	case "capabilities":
		s.handleRuntimeCapabilities(w, r)
	case "items":
		s.handleRuntimeItems(w, r)
	case "chapters":
		s.handleRuntimeChapters(w, r)
	case "refresh":
		s.handleRuntimeRefresh(w, r)
	case "clear-refresh":
		s.handleRuntimeClearRefresh(w, r)
	case "load-more":
		s.handleRuntimeLoadMore(w, r)
	case "search":
		s.handleRuntimeSearch(w, r)
	case "open-detail":
		s.handleRuntimeOpenDetail(w, r)
	case "open-chapters":
		s.handleRuntimeOpenChapters(w, r)
	case "load-more-chapters":
		s.handleRuntimeLoadMoreChapters(w, r)
	case "refresh-chapters":
		s.handleRuntimeRefreshChapters(w, r)
	case "clear-refresh-chapters":
		s.handleRuntimeClearRefreshChapters(w, r)
	case "open-chapter-detail":
		s.handleRuntimeOpenChapterDetail(w, r)
	default:
		writeJSON(w, http.StatusNotFound, errorBody("not found"))
	}
}

func (s *Server) handlePluginVariablesV2(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v2/plugins/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 2 || parts[1] != "variables" {
		writeJSON(w, http.StatusNotFound, errorBody("not found"))
		return
	}
	pluginID := parts[0]
	rec, ok := s.registry.Get(pluginID)
	if !ok {
		writeJSON(w, http.StatusNotFound, errorBody("plugin not found"))
		return
	}

	switch {
	case len(parts) == 3 && parts[2] == "schema" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{
			"variables": s.registry.GetPluginVariablesSchema(rec),
		})
	case len(parts) == 2 && r.Method == http.MethodGet:
		values, err := s.registry.GetPluginVariablesMasked(r.Context(), rec)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"values": values})
	case len(parts) == 2 && r.Method == http.MethodPut:
		var body struct {
			Values map[string]string `json:"values"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, errorBody("invalid JSON body"))
			return
		}
		if err := s.registry.SavePluginVariables(r.Context(), pluginID, body.Values); err != nil {
			writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
	}
}

func (s *Server) handleRuntimeCapabilities(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	pluginID := strings.TrimSpace(r.URL.Query().Get("plugin_id"))
	channelID := strings.TrimSpace(r.URL.Query().Get("channel_id"))
	if pluginID == "" || channelID == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("plugin_id and channel_id are required"))
		return
	}
	cap, err := s.registry.Dispatcher().Capabilities(pluginID, channelID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, cap)
}

func (s *Server) handleRuntimeItems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	pluginID := strings.TrimSpace(r.URL.Query().Get("plugin_id"))
	channelID := strings.TrimSpace(r.URL.Query().Get("channel_id"))
	limit := queryInt(r, "limit", 20)
	offset := queryInt(r, "offset", 0)
	if pluginID == "" || channelID == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("plugin_id and channel_id are required"))
		return
	}
	result, err := s.registry.Dispatcher().ListItems(r.Context(), pluginID, channelID, limit, offset)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleRuntimeChapters(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	pluginID := strings.TrimSpace(r.URL.Query().Get("plugin_id"))
	channelID := strings.TrimSpace(r.URL.Query().Get("channel_id"))
	parentID := strings.TrimSpace(r.URL.Query().Get("parent_id"))
	if pluginID == "" || channelID == "" || parentID == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("plugin_id, channel_id and parent_id are required"))
		return
	}
	result, err := s.registry.Dispatcher().ListChapters(r.Context(), pluginID, channelID, parentID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, result)
}

type runtimeActionBody struct {
	PluginID      string            `json:"pluginId"`
	ChannelID     string            `json:"channelId"`
	Query         string            `json:"query,omitempty"`
	ItemID        string            `json:"itemId,omitempty"`
	ParentItemID  string            `json:"parentItemId,omitempty"`
	ChapterItemID string            `json:"chapterItemId,omitempty"`
	Params        map[string]string `json:"params,omitempty"`
	ForceRefresh  bool              `json:"forceRefresh,omitempty"`
}

func (s *Server) handleRuntimeRefresh(w http.ResponseWriter, r *http.Request) {
	s.handleRuntimeAction(w, r, func(body runtimeActionBody) (plugin.DispatchResult, error) {
		return s.registry.Dispatcher().Refresh(r.Context(), body.PluginID, body.ChannelID)
	})
}

func (s *Server) handleRuntimeClearRefresh(w http.ResponseWriter, r *http.Request) {
	s.handleRuntimeAction(w, r, func(body runtimeActionBody) (plugin.DispatchResult, error) {
		return s.registry.Dispatcher().ClearAndRefresh(r.Context(), body.PluginID, body.ChannelID)
	})
}

func (s *Server) handleRuntimeLoadMore(w http.ResponseWriter, r *http.Request) {
	s.handleRuntimeAction(w, r, func(body runtimeActionBody) (plugin.DispatchResult, error) {
		return s.registry.Dispatcher().LoadMore(r.Context(), body.PluginID, body.ChannelID, body.Params)
	})
}

func (s *Server) handleRuntimeSearch(w http.ResponseWriter, r *http.Request) {
	s.handleRuntimeAction(w, r, func(body runtimeActionBody) (plugin.DispatchResult, error) {
		return s.registry.Dispatcher().Search(r.Context(), body.PluginID, body.ChannelID, body.Query)
	})
}

func (s *Server) handleRuntimeOpenDetail(w http.ResponseWriter, r *http.Request) {
	s.handleRuntimeAction(w, r, func(body runtimeActionBody) (plugin.DispatchResult, error) {
		return s.registry.Dispatcher().OpenDetail(
			r.Context(),
			body.PluginID,
			body.ChannelID,
			body.ItemID,
			body.ForceRefresh,
		)
	})
}

func (s *Server) handleRuntimeOpenChapters(w http.ResponseWriter, r *http.Request) {
	s.handleRuntimeAction(w, r, func(body runtimeActionBody) (plugin.DispatchResult, error) {
		return s.registry.Dispatcher().OpenChapters(r.Context(), body.PluginID, body.ChannelID, body.ItemID)
	})
}

func (s *Server) handleRuntimeLoadMoreChapters(w http.ResponseWriter, r *http.Request) {
	s.handleRuntimeAction(w, r, func(body runtimeActionBody) (plugin.DispatchResult, error) {
		return s.registry.Dispatcher().LoadMoreChapters(r.Context(), body.PluginID, body.ChannelID, body.ItemID)
	})
}

func (s *Server) handleRuntimeRefreshChapters(w http.ResponseWriter, r *http.Request) {
	s.handleRuntimeAction(w, r, func(body runtimeActionBody) (plugin.DispatchResult, error) {
		return s.registry.Dispatcher().RefreshChapters(r.Context(), body.PluginID, body.ChannelID, body.ItemID)
	})
}

func (s *Server) handleRuntimeClearRefreshChapters(w http.ResponseWriter, r *http.Request) {
	s.handleRuntimeAction(w, r, func(body runtimeActionBody) (plugin.DispatchResult, error) {
		return s.registry.Dispatcher().ClearAndRefreshChapters(r.Context(), body.PluginID, body.ChannelID, body.ItemID)
	})
}

func (s *Server) handleRuntimeOpenChapterDetail(w http.ResponseWriter, r *http.Request) {
	s.handleRuntimeAction(w, r, func(body runtimeActionBody) (plugin.DispatchResult, error) {
		return s.registry.Dispatcher().OpenChapterDetail(
			r.Context(), body.PluginID, body.ChannelID, body.ParentItemID, body.ChapterItemID,
		)
	})
}

func (s *Server) handleRuntimeAction(
	w http.ResponseWriter,
	r *http.Request,
	fn func(runtimeActionBody) (plugin.DispatchResult, error),
) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	var body runtimeActionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid JSON body"))
		return
	}
	if strings.TrimSpace(body.PluginID) == "" || strings.TrimSpace(body.ChannelID) == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("pluginId and channelId are required"))
		return
	}
	result, err := fn(body)
	if err != nil {
		rec, _ := s.registry.Get(body.PluginID)
		writePluginActionError(w, http.StatusBadRequest, rec, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func queryInt(r *http.Request, key string, def int) int {
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return def
	}
	var n int
	if _, err := fmt.Sscanf(raw, "%d", &n); err != nil || n < 0 {
		return def
	}
	return n
}
