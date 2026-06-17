package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/orbit-tauri-tools/runtime/internal/store"
)

type dictView struct {
	ID      int64  `json:"id"`
	Type    string `json:"type"`
	Label   string `json:"label"`
	Value   string `json:"value"`
	Remarks string `json:"remarks,omitempty"`
}

func (s *Server) handleDicts(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/v1/dicts" {
		s.handleDictByPath(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		s.handleListDicts(w, r, strings.TrimSpace(r.URL.Query().Get("type")))
	default:
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
	}
}

func (s *Server) handleDictByPath(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/dicts/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeJSON(w, http.StatusNotFound, errorBody("not found"))
		return
	}

	dictType := parts[0]
	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			s.handleListDicts(w, r, dictType)
		default:
			writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		}
		return
	}

	label := parts[1]
	if len(parts) != 2 {
		writeJSON(w, http.StatusNotFound, errorBody("not found"))
		return
	}

	switch r.Method {
	case http.MethodGet:
		s.handleGetDict(w, r, dictType, label)
	case http.MethodPut, http.MethodPatch:
		s.handleUpsertDict(w, r, dictType, label)
	case http.MethodDelete:
		s.handleDeleteDict(w, r, dictType, label)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
	}
}

func (s *Server) handleListDicts(w http.ResponseWriter, r *http.Request, dictType string) {
	rows, err := s.store.ListDicts(r.Context(), dictType)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items": dictRowsToView(rows),
	})
}

func (s *Server) handleGetDict(w http.ResponseWriter, r *http.Request, dictType, label string) {
	row, ok, err := s.store.GetDict(r.Context(), dictType, label)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, errorBody("dict not found"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"item": dictRowToView(row),
	})
}

func (s *Server) handleUpsertDict(w http.ResponseWriter, r *http.Request, dictType, label string) {
	var body struct {
		Value   *string `json:"value"`
		Remarks *string `json:"remarks"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid JSON body"))
		return
	}

	existing, ok, err := s.store.GetDict(r.Context(), dictType, label)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}

	row := store.DictRow{
		Type:  dictType,
		Label: label,
	}
	if r.Method == http.MethodPatch && ok {
		row.Value = existing.Value
		row.Remarks = existing.Remarks
		if body.Value != nil {
			row.Value = *body.Value
		}
		if body.Remarks != nil {
			row.Remarks = *body.Remarks
		}
	} else {
		if body.Value == nil {
			writeJSON(w, http.StatusBadRequest, errorBody("value is required"))
			return
		}
		row.Value = *body.Value
		if body.Remarks != nil {
			row.Remarks = *body.Remarks
		}
	}

	saved, err := s.store.UpsertDict(r.Context(), row)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"item": dictRowToView(saved),
	})
}

func (s *Server) handleDeleteDict(w http.ResponseWriter, r *http.Request, dictType, label string) {
	if err := s.store.DeleteDict(r.Context(), dictType, label); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func dictRowsToView(rows []store.DictRow) []dictView {
	out := make([]dictView, 0, len(rows))
	for _, row := range rows {
		out = append(out, dictRowToView(row))
	}
	return out
}

func dictRowToView(row store.DictRow) dictView {
	return dictView{
		ID:      row.ID,
		Type:    row.Type,
		Label:   row.Label,
		Value:   row.Value,
		Remarks: row.Remarks,
	}
}
