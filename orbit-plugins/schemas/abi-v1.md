# Orbit WASM Plugin ABI v1

## Transport

- One JSON request line on **stdin**, one JSON response line on **stdout**.
- WASM entry: WASI `_start`; plugin `main` calls `sdk.Run(handler)`.
- Manifest metadata lives only in **`manifest.json`** on disk (not returned by WASM).

## Request envelope

```json
{ "action": "fetch", "data": { "channelId": "trending", "route": "/juejin/trending", "params": {} } }
```

### Actions (v1)

| Action | Status |
|--------|--------|
| `fetch` | Required |
| `manifest` | Dev-only self-check; runtime does not call |
| `parse` | Reserved for Phase 3 hybrid browser mode |

## Response envelope

```json
{ "ok": true, "data": { "title": "…", "description": "…", "items": [] } }
```

```json
{ "ok": false, "error": "human readable message" }
```

## Feed item fields

| Field | Type | Maps to runtime |
|-------|------|-----------------|
| `id` | string | Prefixed as `{pluginId}:{channelId}:{id}` |
| `title` | string | required |
| `url` | string | `sourceUrl` |
| `summary` | string | optional |
| `content` | string | optional |
| `author` | string | optional |
| `cover` / `image` | string | `image` |
| `published_at` | RFC3339 | `publishedAt` unix |
| `tags` | string[] | optional |

## Host module `orbit`

Imported by plugins (`//go:wasmimport orbit …`). Implemented by the Go runtime (wazero).

| Export | Signature | Description |
|--------|-----------|-------------|
| `http_request` | `(req_ptr, req_len, resp_ptr, resp_cap) -> u32` | JSON in/out; returns bytes written |
| `log` | `(level_ptr, level_len, msg_ptr, msg_len)` | Debug logging |
| `now_unix` | `() -> i64` | Current unix time |

### `http_request` input JSON

```json
{ "method": "GET", "url": "https://…", "headers": {}, "body": "" }
```

### `http_request` output JSON

```json
{ "status": 200, "body": "…" }
```

```json
{ "error": "message" }
```

Network uses manifest `config.userAgent` when set.

## Security (runtime)

- Per-invocation timeout (`config.wasm.timeoutMs`, default 30000)
- Memory cap (`config.wasm.maxMemoryMB`, default 64)
- Response body limit 8 MiB per HTTP call

## Native development

Without WASM, build tags use real `net/http`:

```bash
cd orbit-plugins/plugins/juejin
echo '{"action":"fetch","data":{"channelId":"trending","route":"/juejin/trending","params":{}}}' | go run .
```

## WASM build

```bash
cd orbit-plugins/plugins/juejin
make build   # -> dist/juejin/plugin.wasm
make sync    # -> ../../plugins/juejin/
```
