package plugin

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"
)

const wasmHostModule = "orbit"

// WASMExecutor runs official WASM plugins via WASI stdin/stdout and host imports.
type WASMExecutor struct{}

func NewWASMExecutor() *WASMExecutor {
	return &WASMExecutor{}
}

type wasmEnvelope struct {
	Action string          `json:"action"`
	Data   json.RawMessage `json:"data"`
}

type wasmFetchData struct {
	ChannelID string            `json:"channelId"`
	Route     string            `json:"route"`
	Params    map[string]string `json:"params"`
	Vars      map[string]string `json:"vars,omitempty"`
	Secrets   map[string]string `json:"secrets,omitempty"`
}

func buildWasmFetchData(rec *PluginRecord, ch *FeedChannel) wasmFetchData {
	return buildWasmFetchDataWithParams(rec, ch, nil)
}

func mustJSONMap(m map[string]string) string {
	if len(m) == 0 {
		return "{}"
	}
	data, err := json.Marshal(m)
	if err != nil {
		return fmt.Sprintf("%v", m)
	}
	return string(data)
}

func buildWasmFetchDataWithParams(rec *PluginRecord, ch *FeedChannel, overrides map[string]string) wasmFetchData {
	merged := make(map[string]string, len(ch.Params)+len(overrides))
	for k, v := range ch.Params {
		merged[k] = v
	}
	for k, v := range overrides {
		merged[k] = v
	}
	data := wasmFetchData{
		ChannelID: ch.ID,
		Route:     ch.Route,
		Params:    merged,
	}
	if rec != nil && len(rec.Config.Secrets) > 0 {
		data.Secrets = make(map[string]string, len(rec.Config.Secrets))
		for k, v := range rec.Config.Secrets {
			data.Secrets[k] = v
		}
	}
	return data
}

type wasmResponse struct {
	OK    bool            `json:"ok"`
	Data  json.RawMessage `json:"data,omitempty"`
	Error string          `json:"error,omitempty"`
}

type wasmFeedResult struct {
	Title       string            `json:"title"`
	Description string            `json:"description,omitempty"`
	Items       []wasmFeedItem    `json:"items"`
	HasMore     *bool             `json:"hasMore,omitempty"`
	Next        map[string]string `json:"next,omitempty"`
}

type wasmFeedItem struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	URL         string   `json:"url"`
	Content     string   `json:"content,omitempty"`
	Summary     string   `json:"summary,omitempty"`
	Author      string   `json:"author,omitempty"`
	Cover       string   `json:"cover,omitempty"`
	Image       string   `json:"image,omitempty"`
	PublishedAt string   `json:"published_at"`
	Tags        []string `json:"tags,omitempty"`
}

type hostHTTPRequest struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body,omitempty"`
}

type hostHTTPResponse struct {
	Status     int               `json:"status"`
	Headers    map[string]string `json:"headers,omitempty"`
	Body       string            `json:"body"`
	BodyBase64 string            `json:"body_base64,omitempty"`
	Error      string            `json:"error,omitempty"`
}

func loadWasmBinary(path string) ([]byte, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if strings.HasSuffix(strings.ToLower(path), ".br") {
		r := brotli.NewReader(bytes.NewReader(raw))
		decompressed, err := io.ReadAll(io.LimitReader(r, 64<<20))
		if err != nil {
			return nil, fmt.Errorf("decompress brotli wasm: %w", err)
		}
		return decompressed, nil
	}
	return raw, nil
}

func (e *WASMExecutor) Fetch(ctx context.Context, pluginDir string, rec *PluginRecord, req FetchRequest) (FetchResult, error) {
	if rec == nil {
		return FetchResult{}, fmt.Errorf("plugin record is required")
	}
	entry := strings.TrimSpace(rec.Config.Wasm.Entry)
	if entry == "" {
		entry = DefaultWasmConfig().Entry
	}
	wasmPath := filepath.Join(pluginDir, entry)
	data, err := loadWasmBinary(wasmPath)
	if err != nil {
		return FetchResult{}, fmt.Errorf("read wasm: %w", err)
	}

	timeout := time.Duration(rec.Config.Wasm.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = time.Duration(DefaultWasmConfig().TimeoutMs) * time.Millisecond
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	fetchData := wasmFetchData{
		ChannelID: req.ChannelID,
		Route:     req.Route,
		Params:    req.Params,
		Vars:      req.Vars,
	}
	if len(fetchData.Vars) > 0 {
		fetchData.Secrets = fetchData.Vars
	}
	reqData, _ := json.Marshal(fetchData)
	env, _ := json.Marshal(wasmEnvelope{Action: "fetch", Data: reqData})
	stdinLine := string(env) + "\n"
	log.Printf(
		"[orbit-v2] wasm fetch plugin=%q channel=%q route=%q params=%s",
		rec.ID, req.ChannelID, req.Route, mustJSONMap(req.Params),
	)

	raw, err := e.run(runCtx, data, stdinLine, rec, timeout)
	if err != nil {
		return FetchResult{}, err
	}

	var resp wasmResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return FetchResult{}, fmt.Errorf("parse wasm response: %w", err)
	}
	if !resp.OK {
		if resp.Error != "" {
			return FetchResult{}, fmt.Errorf("%s", resp.Error)
		}
		return FetchResult{}, fmt.Errorf("wasm plugin returned error")
	}

	var result wasmFeedResult
	if err := json.Unmarshal(resp.Data, &result); err != nil {
		return FetchResult{}, fmt.Errorf("parse wasm feed result: %w", err)
	}
	items := mapWasmFeedItems(rec, req.ChannelID, result)
	return FetchResult{
		Title:       result.Title,
		Description: result.Description,
		Items:       items,
		HasMore:     result.HasMore,
		Next:        result.Next,
	}, nil
}

func (e *WASMExecutor) FetchChannel(ctx context.Context, pluginDir string, rec *PluginRecord, ch *FeedChannel) ([]FeedItem, error) {
	return e.FetchChannelWithParams(ctx, pluginDir, rec, ch, nil)
}

func (e *WASMExecutor) FetchChannelWithParams(ctx context.Context, pluginDir string, rec *PluginRecord, ch *FeedChannel, params map[string]string) ([]FeedItem, error) {
	if rec == nil || ch == nil {
		return nil, fmt.Errorf("plugin and channel are required")
	}
	entry := strings.TrimSpace(rec.Config.Wasm.Entry)
	if entry == "" {
		entry = DefaultWasmConfig().Entry
	}
	wasmPath := filepath.Join(pluginDir, entry)
	data, err := loadWasmBinary(wasmPath)
	if err != nil {
		return nil, fmt.Errorf("read wasm: %w", err)
	}

	timeout := time.Duration(rec.Config.Wasm.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = time.Duration(DefaultWasmConfig().TimeoutMs) * time.Millisecond
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	fetchData := buildWasmFetchDataWithParams(rec, ch, params)
	reqData, _ := json.Marshal(fetchData)
	env, _ := json.Marshal(wasmEnvelope{Action: "fetch", Data: reqData})
	stdinLine := string(env) + "\n"
	log.Printf(
		"[orbit-feed] wasm stdin plugin=%q channel=%q overrides=%s merged_params=%s envelope=%s",
		rec.ID, ch.ID, mustJSONMap(params), mustJSONMap(fetchData.Params), strings.TrimSpace(string(env)),
	)

	raw, err := e.run(runCtx, data, stdinLine, rec, timeout)
	if err != nil {
		return nil, err
	}

	var resp wasmResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("parse wasm response: %w", err)
	}
	if !resp.OK {
		if resp.Error != "" {
			return nil, fmt.Errorf("%s", resp.Error)
		}
		return nil, fmt.Errorf("wasm plugin returned error")
	}

	var result wasmFeedResult
	if err := json.Unmarshal(resp.Data, &result); err != nil {
		return nil, fmt.Errorf("parse wasm feed result: %w", err)
	}
	return mapWasmFeedItems(rec, ch.ID, result), nil
}

func (e *WASMExecutor) run(ctx context.Context, wasmBin []byte, stdinLine string, rec *PluginRecord, httpTimeout time.Duration) ([]byte, error) {
	rt := wazero.NewRuntime(ctx)
	defer rt.Close(ctx)

	stdout := &bytes.Buffer{}
	stdin := strings.NewReader(stdinLine)

	httpClient := &http.Client{Timeout: httpTimeout}
	hostBuilder := rt.NewHostModuleBuilder(wasmHostModule)
	hostBuilder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, mod api.Module, reqPtr, reqLen, respPtr, respCap uint32) uint32 {
			return wasmHostHTTP(ctx, mod, httpClient, rec, reqPtr, reqLen, respPtr, respCap)
		}).
		Export("http_request")
	hostBuilder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, mod api.Module, levelPtr, levelLen, msgPtr, msgLen uint32) {
			_ = readModuleString(mod, levelPtr, levelLen)
			_ = readModuleString(mod, msgPtr, msgLen)
		}).
		Export("log")
	hostBuilder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context) int64 {
			return time.Now().Unix()
		}).
		Export("now_unix")
	if _, err := hostBuilder.Instantiate(ctx); err != nil {
		return nil, fmt.Errorf("instantiate host module: %w", err)
	}

	if _, err := wasi_snapshot_preview1.Instantiate(ctx, rt); err != nil {
		return nil, fmt.Errorf("instantiate wasi: %w", err)
	}

	cfg := wazero.NewModuleConfig().
		WithStdin(stdin).
		WithStdout(stdout).
		WithStderr(io.Discard).
		WithStartFunctions("_start")
	mod, err := rt.InstantiateWithConfig(ctx, wasmBin, cfg)
	if err != nil {
		return nil, fmt.Errorf("instantiate wasm: %w", err)
	}
	defer mod.Close(ctx)

	line, err := readStdoutLine(stdout.Bytes())
	if err != nil {
		return nil, err
	}
	return line, nil
}

func wasmHostHTTP(
	ctx context.Context,
	mod api.Module,
	client *http.Client,
	rec *PluginRecord,
	reqPtr, reqLen, respPtr, respCap uint32,
) uint32 {
	reqJSON, ok := mod.Memory().Read(reqPtr, reqLen)
	if !ok {
		return 0
	}
	var req hostHTTPRequest
	if err := json.Unmarshal(reqJSON, &req); err != nil {
		return writeHostResp(mod, respPtr, respCap, hostHTTPResponse{Error: err.Error()})
	}
	method := strings.TrimSpace(req.Method)
	if method == "" {
		method = http.MethodGet
	}
	httpReq, err := http.NewRequestWithContext(ctx, method, req.URL, strings.NewReader(req.Body))
	if err != nil {
		return writeHostResp(mod, respPtr, respCap, hostHTTPResponse{Error: err.Error()})
	}
	ua := strings.TrimSpace(rec.Config.UserAgent)
	if ua == "" {
		ua = defaultUserAgent
	}
	httpReq.Header.Set("User-Agent", ua)
	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		return writeHostResp(mod, respPtr, respCap, hostHTTPResponse{Error: err.Error()})
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return writeHostResp(mod, respPtr, respCap, hostHTTPResponse{Error: err.Error()})
	}
	hostResp := hostHTTPResponse{Status: resp.StatusCode}
	if isTextHTTPContentType(resp.Header.Get("Content-Type")) {
		hostResp.Body = string(body)
	} else {
		hostResp.BodyBase64 = base64.StdEncoding.EncodeToString(body)
	}
	return writeHostResp(mod, respPtr, respCap, hostResp)
}

func isTextHTTPContentType(contentType string) bool {
	ct := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	if ct == "" {
		return false
	}
	if strings.HasPrefix(ct, "text/") {
		return true
	}
	switch ct {
	case "application/json", "application/javascript", "application/xml",
		"application/xhtml+xml", "application/ld+json":
		return true
	default:
		return false
	}
}

func writeHostResp(mod api.Module, respPtr, respCap uint32, resp hostHTTPResponse) uint32 {
	data, err := json.Marshal(resp)
	if err != nil {
		return 0
	}
	if uint32(len(data)) > respCap {
		return 0
	}
	if !mod.Memory().Write(respPtr, data) {
		return 0
	}
	return uint32(len(data))
}

func readModuleString(mod api.Module, ptr, ln uint32) string {
	b, ok := mod.Memory().Read(ptr, ln)
	if !ok {
		return ""
	}
	return string(b)
}

func readStdoutLine(out []byte) ([]byte, error) {
	trimmed := bytes.TrimSpace(out)
	if len(trimmed) == 0 {
		return nil, fmt.Errorf("wasm produced no stdout")
	}
	if idx := bytes.IndexByte(trimmed, '\n'); idx >= 0 {
		trimmed = trimmed[:idx]
	}
	return trimmed, nil
}

func mapWasmFeedItems(rec *PluginRecord, channelID string, result wasmFeedResult) []FeedItem {
	contentType := ContentTypeForMedia(rec.MediaType)
	items := make([]FeedItem, 0, len(result.Items))
	for _, it := range result.Items {
		if strings.TrimSpace(it.Title) == "" {
			continue
		}
		id := strings.TrimSpace(it.ID)
		if id == "" {
			id = sha256Hex(strings.TrimSpace(it.URL) + it.Title)
		}

		publishedAt := parsePublishedAt(it.PublishedAt)
		img := strings.TrimSpace(it.Cover)
		if img == "" {
			img = strings.TrimSpace(it.Image)
		}
		items = append(items, FeedItem{
			ID:          id,
			Title:       it.Title,
			Summary:     it.Summary,
			Content:     it.Content,
			Type:        contentType,
			PluginID:    rec.ID,
			PluginName:  rec.Name,
			Author:      it.Author,
			PublishedAt: publishedAt,
			Time:        formatFeedRelativeTime(publishedAt),
			Image:       img,
			SourceURL:   strings.TrimSpace(it.URL),
			ChannelID:   channelID,
			Tags:        append([]string(nil), it.Tags...),
		})
	}
	return items
}

func parsePublishedAt(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Now().Unix()
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.Unix()
	}
	if t, err := time.Parse("2006-01-02T15:04:05Z07:00", s); err == nil {
		return t.Unix()
	}
	return time.Now().Unix()
}

func formatFeedRelativeTime(unix int64) string {
	d := time.Since(time.Unix(unix, 0))
	if d < time.Minute {
		return "刚刚"
	}
	if d < time.Hour {
		return fmt.Sprintf("%d 分钟前", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%d 小时前", int(d.Hours()))
	}
	return fmt.Sprintf("%d 天前", int(d.Hours()/24))
}
