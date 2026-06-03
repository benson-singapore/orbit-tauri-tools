package server

import (
	"net/http"
)

func (s *Server) handleSwaggerRedirect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	http.Redirect(w, r, "/swagger/", http.StatusTemporaryRedirect)
}

func (s *Server) handleSwaggerUI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(swaggerHTML))
}

func (s *Server) handleOpenAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	writeJSON(w, http.StatusOK, buildOpenAPISpec())
}

func buildOpenAPISpec() map[string]any {
	return map[string]any{
		"openapi": "3.0.3",
		"info": map[string]any{
			"title":       "Orbit Runtime API",
			"version":     Version,
			"description": "Runtime HTTP API (served by orbit-tauri-tools runtime).",
		},
		"paths": map[string]any{
			"/health": map[string]any{
				"get": map[string]any{
					"summary":   "Health check",
					"responses": responseJSON(map[string]any{"ok": true, "version": Version}),
				},
			},
			"/v1/status": map[string]any{
				"get": map[string]any{
					"summary":   "Runtime status",
					"responses": responseJSON(map[string]any{"ok": true, "runtime": Version, "db": "ready", "sqlite_path": "/path/to/db.sqlite"}),
				},
			},
			"/v1/plugins": map[string]any{
				"get": map[string]any{
					"summary":   "List plugins",
					"responses": responseJSON(map[string]any{"plugins": []any{map[string]any{"id": "demo", "name": "Demo", "icon": "rss", "active": true}}}),
				},
				"post": map[string]any{
					"summary": "Install plugin (RSS only)",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type": "object",
									"properties": map[string]any{
										"source":          map[string]any{"type": "string"},
										"feedUrl":         map[string]any{"type": "string"},
										"name":            map[string]any{"type": "string"},
										"id":              map[string]any{"type": "string"},
										"mediaType":       map[string]any{"type": "string"},
										"refreshInterval": map[string]any{"type": "integer"},
										"userAgent":       map[string]any{"type": "string"},
										"icon":            map[string]any{"type": "string"},
										"description":     map[string]any{"type": "string"},
										"color":           map[string]any{"type": "string"},
										"logoText":        map[string]any{"type": "string"},
										"logoImageUrl":    map[string]any{"type": "string"},
										"marketCategory":  map[string]any{"type": "string"},
										"categoryTag":     map[string]any{"type": "string"},
									},
								},
								"example": map[string]any{
									"source":          "rss",
									"feedUrl":         "https://example.com/feed.xml",
									"name":            "Example Feed",
									"id":              "example",
									"mediaType":       "application/rss+xml",
									"refreshInterval": 60,
								},
							},
						},
					},
					"responses": responseJSON(map[string]any{"plugin": map[string]any{"id": "example"}}),
				},
			},
			"/v1/plugins/{id}": map[string]any{
				"parameters": []any{
					map[string]any{
						"name":     "id",
						"in":       "path",
						"required": true,
						"schema":   map[string]any{"type": "string"},
					},
				},
				"patch": map[string]any{
					"summary": "Set plugin active state",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type":       "object",
									"required":   []any{"active"},
									"properties": map[string]any{"active": map[string]any{"type": "boolean"}},
								},
								"example": map[string]any{"active": true},
							},
						},
					},
					"responses": responseJSON(map[string]any{"plugin": map[string]any{"id": "example", "active": true}}),
				},
				"delete": map[string]any{
					"summary":   "Uninstall plugin",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v1/feed": map[string]any{
				"get": map[string]any{
					"summary": "Get feed items",
					"parameters": []any{
						map[string]any{"name": "plugin_id", "in": "query", "required": false, "schema": map[string]any{"type": "string"}},
						map[string]any{"name": "refresh", "in": "query", "required": false, "schema": map[string]any{"type": "boolean"}},
					},
					"responses": responseJSON(map[string]any{"ok": true, "items": []any{}, "count": 0}),
				},
			},
			"/v1/feed/refresh": map[string]any{
				"post": map[string]any{
					"summary": "Refresh feed for a plugin",
					"parameters": []any{
						map[string]any{"name": "plugin_id", "in": "query", "required": true, "schema": map[string]any{"type": "string"}},
					},
					"responses": responseJSON(map[string]any{"ok": true, "count": 0}),
				},
			},
			"/v1/images/upload": map[string]any{
				"post": map[string]any{
					"summary": "Upload image file",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"multipart/form-data": map[string]any{
								"schema": map[string]any{
									"type":     "object",
									"required": []any{"file"},
									"properties": map[string]any{
										"file": map[string]any{"type": "string", "format": "binary"},
									},
								},
							},
						},
					},
					"responses": responseJSON(map[string]any{"ok": true, "data": map[string]any{"image": map[string]any{"url": "https://i.imgbb.com/...", "displayUrl": "https://...", "deleteUrl": "https://..."}}}),
				},
			},
			"/v1/images/upload-url": map[string]any{
				"post": map[string]any{
					"summary": "Upload image by URL",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type":       "object",
									"required":   []any{"url"},
									"properties": map[string]any{"url": map[string]any{"type": "string"}},
								},
								"example": map[string]any{"url": "https://example.com/image.png"},
							},
						},
					},
					"responses": responseJSON(map[string]any{"ok": true, "data": map[string]any{"image": map[string]any{"url": "https://i.imgbb.com/...", "displayUrl": "https://...", "deleteUrl": "https://..."}}}),
				},
			},
		},
	}
}

func responseJSON(example any) map[string]any {
	return map[string]any{
		"200": map[string]any{
			"description": "OK",
			"content": map[string]any{
				"application/json": map[string]any{
					"schema":  map[string]any{"type": "object"},
					"example": example,
				},
			},
		},
	}
}

const swaggerHTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Orbit Runtime API - Swagger</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      html, body { margin: 0; padding: 0; background: #0b1020; }
      #swagger-ui { background: #fff; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function() {
        SwaggerUIBundle({
          url: "/openapi.json",
          dom_id: "#swagger-ui",
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          layout: "StandaloneLayout"
        });
      };
    </script>
  </body>
</html>`
