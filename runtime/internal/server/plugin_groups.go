package server

import (
	"encoding/json"
	"net/http"

	"github.com/orbit-tauri-tools/runtime/internal/store"
)

type pluginGroupView struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type pluginGroupsBody struct {
	Groups      []pluginGroupView   `json:"groups"`
	Assignments map[string]string   `json:"assignments"`
	Collapsed   map[string]bool     `json:"collapsed"`
}

func (s *Server) handlePluginGroups(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.handleGetPluginGroups(w, r)
	case http.MethodPut:
		s.handlePutPluginGroups(w, r)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
	}
}

func (s *Server) handleGetPluginGroups(w http.ResponseWriter, r *http.Request) {
	snap, err := s.store.GetPluginGroups(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, snapshotToView(snap))
}

func (s *Server) handlePutPluginGroups(w http.ResponseWriter, r *http.Request) {
	var body pluginGroupsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid JSON body"))
		return
	}

	groups := make([]store.PluginGroupRow, 0, len(body.Groups))
	for i, g := range body.Groups {
		if g.ID == "" || g.Label == "" {
			continue
		}
		groups = append(groups, store.PluginGroupRow{
			ID:        g.ID,
			Label:     g.Label,
			SortOrder: i,
		})
	}

	assignments := body.Assignments
	if assignments == nil {
		assignments = map[string]string{}
	}
	collapsed := body.Collapsed
	if collapsed == nil {
		collapsed = map[string]bool{}
	}

	snap := store.PluginGroupsSnapshot{
		Groups:      groups,
		Assignments: assignments,
		Collapsed:   collapsed,
	}
	if err := s.store.SavePluginGroups(r.Context(), snap); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, snapshotToView(snap))
}

func snapshotToView(snap store.PluginGroupsSnapshot) pluginGroupsBody {
	groups := make([]pluginGroupView, 0, len(snap.Groups))
	for _, g := range snap.Groups {
		groups = append(groups, pluginGroupView{ID: g.ID, Label: g.Label})
	}
	assignments := snap.Assignments
	if assignments == nil {
		assignments = map[string]string{}
	}
	collapsed := snap.Collapsed
	if collapsed == nil {
		collapsed = map[string]bool{}
	}
	return pluginGroupsBody{
		Groups:      groups,
		Assignments: assignments,
		Collapsed:   collapsed,
	}
}
