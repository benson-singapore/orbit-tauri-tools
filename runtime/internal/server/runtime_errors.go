package server

import (
	"net/http"

	"github.com/orbit-tauri-tools/runtime/internal/plugin"
)

func writePluginActionError(w http.ResponseWriter, status int, rec *plugin.PluginRecord, err error) {
	if rec != nil {
		if payload, ok := plugin.ClassifyBrowserSessionError(rec, err); ok {
			writeJSON(w, status, map[string]any{
				"ok":             false,
				"error":          err.Error(),
				"code":           plugin.BrowserSessionErrorCode,
				"browserSession": payload,
			})
			return
		}
	}
	writeJSON(w, status, errorBody(err.Error()))
}
