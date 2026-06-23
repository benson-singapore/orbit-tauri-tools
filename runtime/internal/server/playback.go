package server

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/orbit-tauri-tools/runtime/internal/plugin"
	"github.com/orbit-tauri-tools/runtime/internal/store"
)

func (s *Server) handlePlayback(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/playback")
	path = strings.Trim(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			s.handlePlaybackList(w, r)
		case http.MethodPut:
			s.handlePlaybackPut(w, r)
		case http.MethodDelete:
			s.handlePlaybackDeleteAll(w, r)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		}
		return
	}

	parts := strings.Split(path, "/")
	if len(parts) != 2 {
		writeJSON(w, http.StatusNotFound, errorBody("not found"))
		return
	}
	pluginID := strings.TrimSpace(parts[0])
	parentID := strings.TrimSpace(parts[1])
	if pluginID == "" || parentID == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("plugin_id and parent_id are required"))
		return
	}

	switch r.Method {
	case http.MethodGet:
		s.handlePlaybackGet(w, r, pluginID, parentID)
	case http.MethodDelete:
		s.handlePlaybackDelete(w, r, pluginID, parentID)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
	}
}

func (s *Server) handlePlaybackList(w http.ResponseWriter, r *http.Request) {
	pluginID := strings.TrimSpace(r.URL.Query().Get("plugin_id"))
	if pluginID == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("plugin_id is required"))
		return
	}

	rec, ch, pb, err := s.resolvePlayback(pluginID, r.URL.Query().Get("channel_id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorBody(err.Error()))
		return
	}
	if !pb.History {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "items": []any{}, "total": 0})
		return
	}

	limit := parsePositiveInt(r.URL.Query().Get("limit"), 50)
	offset := parseNonNegativeInt(r.URL.Query().Get("offset"), 0)
	if limit > pb.Limit {
		limit = pb.Limit
	}

	if pb.ManagedBy == plugin.ManagedByPlugin {
		data, err := s.registry.InvokeWasmAction(r.Context(), pluginID, "playback_list", mustPlaybackJSON(map[string]any{
			"limit":  limit,
			"offset": offset,
		}))
		if err != nil {
			writeJSON(w, http.StatusBadGateway, errorBody(err.Error()))
			return
		}
		writeRawJSON(w, http.StatusOK, mergeOK(data))
		return
	}
	_ = rec
	_ = ch

	items, total, err := s.store.ListPlaybackRecords(r.Context(), pluginID, limit, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":    true,
		"items": items,
		"total": total,
	})
}

func (s *Server) handlePlaybackGet(w http.ResponseWriter, r *http.Request, pluginID, parentID string) {
	_, _, pb, err := s.resolvePlayback(pluginID, r.URL.Query().Get("channel_id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorBody(err.Error()))
		return
	}
	if !pb.History {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": nil})
		return
	}

	if pb.ManagedBy == plugin.ManagedByPlugin {
		data, err := s.registry.InvokeWasmAction(r.Context(), pluginID, "playback_get", mustPlaybackJSON(map[string]any{
			"parentId": parentID,
		}))
		if err != nil {
			writeJSON(w, http.StatusBadGateway, errorBody(err.Error()))
			return
		}
		writeRawJSON(w, http.StatusOK, mergeOKData(data))
		return
	}

	rec, err := s.store.GetPlaybackRecord(r.Context(), pluginID, parentID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": rec})
}

func (s *Server) handlePlaybackPut(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody("read body failed"))
		return
	}

	var req struct {
		PluginID string               `json:"pluginId"`
		Record   store.PlaybackRecord `json:"record"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid json"))
		return
	}
	pluginID := strings.TrimSpace(req.PluginID)
	if pluginID == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("pluginId is required"))
		return
	}
	if strings.TrimSpace(req.Record.ParentID) == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("record.parentId is required"))
		return
	}

	_, _, pb, err := s.resolvePlayback(pluginID, req.Record.ChannelID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorBody(err.Error()))
		return
	}
	if !pb.History {
		writeJSON(w, http.StatusForbidden, errorBody("playback history disabled for plugin"))
		return
	}

	if req.Record.UpdatedAt <= 0 {
		req.Record.UpdatedAt = time.Now().Unix()
	}
	if strings.TrimSpace(req.Record.Mode) == "" {
		req.Record.Mode = pb.Mode
	}
	if !pb.Progress {
		req.Record.Progress = nil
	}

	if pb.ManagedBy == plugin.ManagedByPlugin {
		data, err := s.registry.InvokeWasmAction(r.Context(), pluginID, "playback_put", mustPlaybackJSON(map[string]any{
			"record": req.Record,
		}))
		if err != nil {
			writeJSON(w, http.StatusBadGateway, errorBody(err.Error()))
			return
		}
		writeRawJSON(w, http.StatusOK, mergeOK(data))
		return
	}

	if err := s.store.PutPlaybackRecord(r.Context(), pluginID, req.Record, pb.Limit); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handlePlaybackDelete(w http.ResponseWriter, r *http.Request, pluginID, parentID string) {
	_, _, pb, err := s.resolvePlayback(pluginID, r.URL.Query().Get("channel_id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorBody(err.Error()))
		return
	}

	if pb.ManagedBy == plugin.ManagedByPlugin {
		data, err := s.registry.InvokeWasmAction(r.Context(), pluginID, "playback_delete", mustPlaybackJSON(map[string]any{
			"parentId": parentID,
		}))
		if err != nil {
			writeJSON(w, http.StatusBadGateway, errorBody(err.Error()))
			return
		}
		writeRawJSON(w, http.StatusOK, mergeOK(data))
		return
	}

	if err := s.store.DeletePlaybackRecord(r.Context(), pluginID, parentID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handlePlaybackDeleteAll(w http.ResponseWriter, r *http.Request) {
	pluginID := strings.TrimSpace(r.URL.Query().Get("plugin_id"))
	if pluginID == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("plugin_id is required"))
		return
	}

	_, _, pb, err := s.resolvePlayback(pluginID, r.URL.Query().Get("channel_id"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorBody(err.Error()))
		return
	}

	if pb.ManagedBy == plugin.ManagedByPlugin {
		writeJSON(w, http.StatusNotImplemented, errorBody("bulk delete not supported for plugin-managed playback"))
		return
	}

	if err := s.store.DeleteAllPlaybackRecords(r.Context(), pluginID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) resolvePlayback(pluginID, channelID string) (*plugin.PluginRecord, *plugin.FeedChannel, plugin.ResolvedPlayback, error) {
	rec, ok := s.registry.Get(pluginID)
	if !ok {
		return nil, nil, plugin.ResolvedPlayback{}, errPluginNotFound(pluginID)
	}
	ch, _ := findChannelForPlayback(rec, channelID)
	return rec, ch, plugin.ResolvePlayback(&rec.Manifest, ch), nil
}

func findChannelForPlayback(rec *plugin.PluginRecord, channelID string) (*plugin.FeedChannel, bool) {
	channelID = strings.TrimSpace(channelID)
	if channelID != "" {
		return plugin.FindChannel(rec.Config.Channels, channelID)
	}
	if dc := strings.TrimSpace(rec.Config.DefaultChannel); dc != "" {
		return plugin.FindChannel(rec.Config.Channels, dc)
	}
	if len(rec.Config.Channels) > 0 {
		ch := rec.Config.Channels[0]
		return &ch, true
	}
	return nil, false
}

type playbackNotFoundError string

func (e playbackNotFoundError) Error() string { return string(e) }

func errPluginNotFound(id string) error {
	return playbackNotFoundError("plugin not found: " + id)
}

func mustPlaybackJSON(v any) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}

func mergeOK(data json.RawMessage) json.RawMessage {
	if len(data) == 0 {
		out, _ := json.Marshal(map[string]any{"ok": true})
		return out
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		out, _ := json.Marshal(map[string]any{"ok": true, "data": json.RawMessage(data)})
		return out
	}
	if _, ok := m["ok"]; !ok {
		m["ok"] = true
	}
	out, _ := json.Marshal(m)
	return out
}

func mergeOKData(data json.RawMessage) json.RawMessage {
	if len(data) == 0 {
		out, _ := json.Marshal(map[string]any{"ok": true, "data": nil})
		return out
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		out, _ := json.Marshal(map[string]any{"ok": true, "data": json.RawMessage(data)})
		return out
	}
	if _, ok := m["ok"]; !ok {
		if _, hasData := m["data"]; !hasData {
			m["data"] = json.RawMessage(data)
		}
		m["ok"] = true
	}
	out, _ := json.Marshal(m)
	return out
}

func writeRawJSON(w http.ResponseWriter, status int, data json.RawMessage) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(data)
}
