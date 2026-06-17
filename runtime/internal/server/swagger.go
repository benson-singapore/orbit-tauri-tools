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
	writeJSON(w, http.StatusOK, BuildOpenAPISpec())
}

func BuildOpenAPISpec() map[string]any {
	return map[string]any{
		"openapi": "3.0.3",
		"info": map[string]any{
			"title":       "Orbit Runtime API",
			"version":     Version,
			"description": "Runtime HTTP API (served by orbit-tauri-tools runtime).",
		},
		"tags": []any{
			map[string]any{"name": "Health", "description": "Health checks and runtime status"},
			map[string]any{"name": "Plugin Groups", "description": "Plugin sidebar groups and assignments"},
			map[string]any{"name": "Dicts", "description": "Dictionary CRUD (runtime-managed lookups)"},
			map[string]any{"name": "LLM", "description": "LLM provider configuration and chat streaming"},
			map[string]any{"name": "Plugins", "description": "Plugin install/manage/manifest/readme"},
			map[string]any{"name": "Feed", "description": "Feed items and refresh/read state"},
			map[string]any{"name": "Images", "description": "Image upload/proxy utilities"},
			map[string]any{"name": "Runtime v2", "description": "New runtime API for items/chapters/search/detail"},
			map[string]any{"name": "Plugin Variables v2", "description": "Plugin variables schema/values (v2)"},
		},
		"paths": map[string]any{
			"/health": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Health"},
					"summary":   "Health check",
					"responses": responseJSON(map[string]any{"ok": true, "version": Version}),
				},
			},
			"/v1/status": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Health"},
					"summary":   "Runtime status",
					"responses": responseJSON(map[string]any{"ok": true, "runtime": Version, "db": "ready", "sqlite_path": "/path/to/db.sqlite"}),
				},
			},
			"/v1/plugin-groups": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Plugin Groups"},
					"summary":   "Get plugin groups snapshot",
					"responses": responseJSON(map[string]any{"groups": []any{}, "assignments": map[string]any{}, "collapsed": map[string]any{}}),
				},
				"put": map[string]any{
					"tags":    []any{"Plugin Groups"},
					"summary": "Save plugin groups snapshot",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type": "object",
									"properties": map[string]any{
										"groups": map[string]any{
											"type": "array",
											"items": map[string]any{
												"type":       "object",
												"properties": map[string]any{"id": map[string]any{"type": "string"}, "label": map[string]any{"type": "string"}},
											},
										},
										"assignments": map[string]any{"type": "object", "additionalProperties": map[string]any{"type": "string"}},
										"collapsed":   map[string]any{"type": "object", "additionalProperties": map[string]any{"type": "boolean"}},
									},
								},
								"example": map[string]any{
									"groups":      []any{map[string]any{"id": "default", "label": "默认"}},
									"assignments": map[string]any{"demo": "default"},
									"collapsed":   map[string]any{"default": false},
								},
							},
						},
					},
					"responses": responseJSON(map[string]any{"groups": []any{}, "assignments": map[string]any{}, "collapsed": map[string]any{}}),
				},
			},
			"/v1/dicts": map[string]any{
				"get": map[string]any{
					"tags":        []any{"Dicts"},
					"summary":     "List dict items",
					"description": "Use ?type=xxx to filter; or call /v1/dicts/{type} and /v1/dicts/{type}/{label}.",
					"parameters": []any{
						map[string]any{"name": "type", "in": "query", "required": false, "schema": map[string]any{"type": "string"}},
					},
					"responses": responseJSON(map[string]any{"items": []any{map[string]any{"id": 1, "type": "plugin_type", "label": "RSS", "value": "rss"}}}),
				},
			},
			"/v1/dicts/{type}": map[string]any{
				"parameters": []any{
					map[string]any{"name": "type", "in": "path", "required": true, "schema": map[string]any{"type": "string"}},
				},
				"get": map[string]any{
					"tags":      []any{"Dicts"},
					"summary":   "List dict items by type",
					"responses": responseJSON(map[string]any{"items": []any{map[string]any{"id": 1, "type": "plugin_type", "label": "RSS", "value": "rss"}}}),
				},
			},
			"/v1/dicts/{type}/{label}": map[string]any{
				"parameters": []any{
					map[string]any{"name": "type", "in": "path", "required": true, "schema": map[string]any{"type": "string"}},
					map[string]any{"name": "label", "in": "path", "required": true, "schema": map[string]any{"type": "string"}},
				},
				"get": map[string]any{
					"tags":      []any{"Dicts"},
					"summary":   "Get dict item",
					"responses": responseJSON(map[string]any{"item": map[string]any{"id": 1, "type": "plugin_type", "label": "RSS", "value": "rss", "remarks": ""}}),
				},
				"put": map[string]any{
					"tags":    []any{"Dicts"},
					"summary": "Upsert dict item (replace)",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type":       "object",
									"properties": map[string]any{"value": map[string]any{"type": "string"}, "remarks": map[string]any{"type": "string"}},
									"required":   []any{"value"},
								},
								"example": map[string]any{"value": "rss", "remarks": "RSS plugin type"},
							},
						},
					},
					"responses": responseJSON(map[string]any{"ok": true}),
				},
				"patch": map[string]any{
					"tags":    []any{"Dicts"},
					"summary": "Upsert dict item (patch)",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type":       "object",
									"properties": map[string]any{"value": map[string]any{"type": "string"}, "remarks": map[string]any{"type": "string"}},
								},
								"example": map[string]any{"remarks": "Updated remarks"},
							},
						},
					},
					"responses": responseJSON(map[string]any{"ok": true}),
				},
				"delete": map[string]any{
					"tags":      []any{"Dicts"},
					"summary":   "Delete dict item",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v1/plugins": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Plugins"},
					"summary":   "List plugins",
					"responses": responseJSON(map[string]any{"plugins": []any{map[string]any{"id": "demo", "name": "Demo", "icon": "rss", "active": true}}}),
				},
				"post": map[string]any{
					"tags":    []any{"Plugins"},
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
			"/v1/plugins/order": map[string]any{
				"put": map[string]any{
					"tags":    []any{"Plugins"},
					"summary": "Reorder plugins",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type":       "object",
									"properties": map[string]any{"orderedIds": map[string]any{"type": "array", "items": map[string]any{"type": "string"}}},
									"required":   []any{"orderedIds"},
								},
								"example": map[string]any{"orderedIds": []any{"plugin-a", "plugin-b"}},
							},
						},
					},
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v1/plugins/resync": map[string]any{
				"post": map[string]any{
					"tags":      []any{"Plugins"},
					"summary":   "Resync plugins registry from disk",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v1/plugins/install-orbit": map[string]any{
				"post": map[string]any{
					"tags":        []any{"Plugins"},
					"summary":     "Install Orbit package (zip bytes or multipart)",
					"description": "Accepts multipart/form-data with field `file`, or raw body bytes.",
					"responses":    responseJSON(map[string]any{"plugin": map[string]any{"id": "example"}}),
				},
			},
			"/v1/plugins/market": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Plugins"},
					"summary":   "List market plugins (cached / installed from market)",
					"responses": responseJSON(map[string]any{"plugins": []any{}}),
				},
			},
			"/v1/plugins/market/{marketId}/install": map[string]any{
				"parameters": []any{
					map[string]any{"name": "marketId", "in": "path", "required": true, "schema": map[string]any{"type": "string"}},
				},
				"post": map[string]any{
					"tags":      []any{"Plugins"},
					"summary":   "Install plugin from market",
					"responses": responseJSON(map[string]any{"plugin": map[string]any{"id": "example"}}),
				},
			},
			"/v1/plugins/market/{marketId}/update": map[string]any{
				"parameters": []any{
					map[string]any{"name": "marketId", "in": "path", "required": true, "schema": map[string]any{"type": "string"}},
				},
				"post": map[string]any{
					"tags":    []any{"Plugins"},
					"summary": "Update plugin from market",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type":       "object",
									"properties": map[string]any{"pluginId": map[string]any{"type": "string"}},
									"required":   []any{"pluginId"},
								},
								"example": map[string]any{"pluginId": "example"},
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
					"tags":    []any{"Plugins"},
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
					"tags":      []any{"Plugins"},
					"summary":   "Uninstall plugin",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v1/feed": map[string]any{
				"get": map[string]any{
					"tags":        []any{"Feed"},
					"summary":     "Get feed items from SQLite cache (read-only)",
					"description": "Does not fetch remote feeds. Background scheduler refreshes stale plugins per refreshInterval.",
					"parameters": []any{
						map[string]any{"name": "plugin_id", "in": "query", "required": false, "schema": map[string]any{"type": "string"}},
					},
					"responses": responseJSON(map[string]any{"ok": true, "items": []any{}, "count": 0}),
				},
			},
			"/v1/feed/unread": map[string]any{
				"get": map[string]any{
					"tags":    []any{"Feed"},
					"summary": "Count unread feed items",
					"parameters": []any{
						map[string]any{"name": "plugin_id", "in": "query", "required": false, "schema": map[string]any{"type": "string"}},
						map[string]any{"name": "channel", "in": "query", "required": false, "schema": map[string]any{"type": "string"}},
						map[string]any{"name": "type", "in": "query", "required": false, "schema": map[string]any{"type": "string"}},
						map[string]any{"name": "plugin_ids", "in": "query", "required": false, "schema": map[string]any{"type": "string"}},
					},
					"responses": responseJSON(map[string]any{"ok": true, "unreadTotal": 0}),
				},
			},
			"/v1/feed/item": map[string]any{
				"get": map[string]any{
					"tags":    []any{"Feed"},
					"summary": "Get a single feed item",
					"parameters": []any{
						map[string]any{"name": "id", "in": "query", "required": true, "schema": map[string]any{"type": "string"}},
						map[string]any{"name": "plugin_id", "in": "query", "required": false, "schema": map[string]any{"type": "string"}},
						map[string]any{"name": "channel_id", "in": "query", "required": false, "schema": map[string]any{"type": "string"}},
					},
					"responses": responseJSON(map[string]any{"ok": true, "item": map[string]any{"id": "1", "title": "Example"}}),
				},
			},
			"/v1/feed/refresh": map[string]any{
				"post": map[string]any{
					"tags":    []any{"Feed"},
					"summary": "Refresh feed for a plugin",
					"parameters": []any{
						map[string]any{"name": "plugin_id", "in": "query", "required": true, "schema": map[string]any{"type": "string"}},
						map[string]any{"name": "force", "in": "query", "required": false, "schema": map[string]any{"type": "boolean"}, "description": "Clear cached feed items for the plugin before fetching"},
					},
					"responses": responseJSON(map[string]any{"ok": true, "count": 0}),
				},
			},
			"/v1/feed/read": map[string]any{
				"post": map[string]any{
					"tags":    []any{"Feed"},
					"summary": "Mark feed item as read",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type": "object",
									"properties": map[string]any{
										"id":        map[string]any{"type": "string"},
										"pluginId":  map[string]any{"type": "string"},
										"channelId": map[string]any{"type": "string"},
									},
									"required": []any{"id"},
								},
								"example": map[string]any{"id": "native:1", "pluginId": "demo", "channelId": "main"},
							},
						},
					},
					"responses": responseJSON(map[string]any{"ok": true, "id": "native:1"}),
				},
			},
			"/v1/images/upload": map[string]any{
				"post": map[string]any{
					"tags":    []any{"Images"},
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
					"tags":    []any{"Images"},
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
			"/v1/images/proxy": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Images"},
					"summary": "Proxy image by URL (with SSRF protection)",
					"parameters": []any{
						map[string]any{"name": "url", "in": "query", "required": true, "schema": map[string]any{"type": "string"}},
					},
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v1/llm/chat/stream": map[string]any{
				"post": map[string]any{
					"tags":      []any{"LLM"},
					"summary":  "LLM chat (streaming SSE, OpenAI-compatible proxy)",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type": "object",
									"properties": map[string]any{
										"providerId": map[string]any{"type": "string"},
										"modelId": map[string]any{"type": "string"},
										"messages": map[string]any{
											"type": "array",
											"items": map[string]any{
												"type": "object",
												"properties": map[string]any{
													"role":    map[string]any{"type": "string"},
													"content": map[string]any{"type": "string"},
												},
											},
										},
										"stream": map[string]any{"type": "boolean"},
									},
									"required": []any{"providerId", "modelId", "messages"},
								},
								"example": map[string]any{
									"providerId": "openai",
									"modelId": "gpt-4o-mini",
									"messages": []any{map[string]any{"role": "user", "content": "Hello!"}},
									"stream": true,
								},
							},
						},
					},
					"responses": map[string]any{
						"200": map[string]any{
							"description": "SSE stream; each `data` payload contains JSON: {delta?:string, done?:bool, error?:string}",
							"content": map[string]any{
								"text/event-stream": map[string]any{
									"schema": map[string]any{"type": "string"},
								},
							},
						},
					},
				},
			},
			"/v2/runtime/capabilities": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary": "Runtime v2: capabilities",
					"parameters": []any{
						map[string]any{"name": "plugin_id", "in": "query", "required": true, "schema": map[string]any{"type": "string"}},
						map[string]any{"name": "channel_id", "in": "query", "required": true, "schema": map[string]any{"type": "string"}},
					},
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v2/runtime/items": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary": "Runtime v2: list items",
					"parameters": []any{
						map[string]any{"name": "plugin_id", "in": "query", "required": true, "schema": map[string]any{"type": "string"}},
						map[string]any{"name": "channel_id", "in": "query", "required": true, "schema": map[string]any{"type": "string"}},
						map[string]any{"name": "limit", "in": "query", "required": false, "schema": map[string]any{"type": "integer"}},
						map[string]any{"name": "offset", "in": "query", "required": false, "schema": map[string]any{"type": "integer"}},
					},
					"responses": responseJSON(map[string]any{"ok": true, "items": []any{}}),
				},
			},
			"/v2/runtime/chapters": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary":   "Runtime v2: list chapters",
					"responses": responseJSON(map[string]any{"ok": true, "items": []any{}}),
				},
			},
			"/v2/runtime/refresh": map[string]any{
				"post": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary":   "Runtime v2: refresh",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v2/runtime/clear-refresh": map[string]any{
				"post": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary":   "Runtime v2: clear refresh queue",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v2/runtime/load-more": map[string]any{
				"post": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary":   "Runtime v2: load more",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v2/runtime/search": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary":   "Runtime v2: search",
					"responses": responseJSON(map[string]any{"ok": true, "items": []any{}}),
				},
			},
			"/v2/runtime/open-detail": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary":   "Runtime v2: open detail",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v2/runtime/open-chapters": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary":   "Runtime v2: open chapters",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v2/runtime/load-more-chapters": map[string]any{
				"post": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary":   "Runtime v2: load more chapters",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v2/runtime/refresh-chapters": map[string]any{
				"post": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary":   "Runtime v2: refresh chapters",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v2/runtime/clear-refresh-chapters": map[string]any{
				"post": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary":   "Runtime v2: clear chapters refresh queue",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v2/runtime/open-chapter-detail": map[string]any{
				"get": map[string]any{
					"tags":      []any{"Runtime v2"},
					"summary":   "Runtime v2: open chapter detail",
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v2/plugins/{pluginId}/variables": map[string]any{
				"parameters": []any{
					map[string]any{"name": "pluginId", "in": "path", "required": true, "schema": map[string]any{"type": "string"}},
				},
				"get": map[string]any{
					"tags":      []any{"Plugin Variables v2"},
					"summary":   "Plugin variables v2: get values (masked)",
					"responses": responseJSON(map[string]any{"values": map[string]any{}}),
				},
				"put": map[string]any{
					"tags":    []any{"Plugin Variables v2"},
					"summary": "Plugin variables v2: save values",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type":       "object",
									"properties": map[string]any{"values": map[string]any{"type": "object", "additionalProperties": map[string]any{"type": "string"}}},
								},
								"example": map[string]any{"values": map[string]any{"API_KEY": "******"}},
							},
						},
					},
					"responses": responseJSON(map[string]any{"ok": true}),
				},
			},
			"/v2/plugins/{pluginId}/variables/schema": map[string]any{
				"parameters": []any{
					map[string]any{"name": "pluginId", "in": "path", "required": true, "schema": map[string]any{"type": "string"}},
				},
				"get": map[string]any{
					"tags":      []any{"Plugin Variables v2"},
					"summary":   "Plugin variables v2: get schema",
					"responses": responseJSON(map[string]any{"variables": []any{}}),
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
