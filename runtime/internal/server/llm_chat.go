package server

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const (
	llmConfigDictType  = "llm_config"
	llmConfigProvidersLabel = "providers_v1"
)

type llmProvidersConfig struct {
	Version  int                 `json:"version"`
	Providers []llmProvider      `json:"providers"`
	Active   *llmActiveProvider `json:"active,omitempty"`
}

type llmActiveProvider struct {
	ProviderId string `json:"providerId,omitempty"`
	ModelId    string `json:"modelId,omitempty"`
}

type llmProvider struct {
	Id      string            `json:"id"`
	Name    string            `json:"name"`
	ApiURL  string            `json:"api_url"`
	ApiKey  string            `json:"api_key"`
	Models  []llmProviderModel `json:"models"`
}

type llmProviderModel struct {
	Id    string `json:"id"`
	Label string `json:"label"`
}

type llmChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type llmChatStreamRequest struct {
	ProviderId string           `json:"providerId"`
	ModelId    string           `json:"modelId"`
	Messages   []llmChatMessage `json:"messages"`
	Stream     *bool            `json:"stream,omitempty"`
}

type llmSSEEventDelta struct {
	Delta string `json:"delta,omitempty"`
	Done  bool   `json:"done,omitempty"`
	Error string `json:"error,omitempty"`
}

// openAI-compatible streaming response chunk (subset).
type openAIChatChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason,omitempty"`
	} `json:"choices"`
}

func (s *Server) handleLLMChatStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	var req llmChatStreamRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid JSON body"))
		return
	}

	req.ProviderId = strings.TrimSpace(req.ProviderId)
	req.ModelId = strings.TrimSpace(req.ModelId)
	if req.ProviderId == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("providerId is required"))
		return
	}
	if req.ModelId == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("modelId is required"))
		return
	}
	if len(req.Messages) == 0 {
		writeJSON(w, http.StatusBadRequest, errorBody("messages is required"))
		return
	}

	cfg, err := s.loadLLMProvidersConfig(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody(err.Error()))
		return
	}
	provider := findProvider(cfg.Providers, req.ProviderId)
	if provider == nil {
		writeJSON(w, http.StatusBadRequest, errorBody("provider not found"))
		return
	}
	model := findModel(provider.Models, req.ModelId)
	if model == nil {
		writeJSON(w, http.StatusBadRequest, errorBody("model not found"))
		return
	}

	endpoint, err := chatCompletionsEndpoint(provider.ApiURL)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
		return
	}

	upstreamBody := map[string]any{
		"model":    model.Id,
		"messages": req.Messages,
		"stream":   true,
	}
	upstreamJSON, _ := json.Marshal(upstreamBody)

	upReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, endpoint, bytes.NewReader(upstreamJSON))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody("create upstream request failed"))
		return
	}
	upReq.Header.Set("Content-Type", "application/json")
	upReq.Header.Set("Accept", "text/event-stream")
	if strings.TrimSpace(provider.ApiKey) != "" {
		// OpenAI compatible format.
		upReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(provider.ApiKey))
	}

	resp, err := http.DefaultClient.Do(upReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorBody(fmt.Sprintf("upstream request failed: %v", err)))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		writeJSON(w, http.StatusBadGateway, errorBody(fmt.Sprintf("upstream returned %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))))
		return
	}

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	// Write header immediately to start streaming.
	w.WriteHeader(http.StatusOK)

	flusher, _ := w.(http.Flusher)

	sendEvent := func(ev llmSSEEventDelta) {
		b, _ := json.Marshal(ev)
		_, _ = w.Write([]byte("data: " + string(b) + "\n\n"))
		if flusher != nil {
			flusher.Flush()
		}
	}

	rd := bufio.NewReader(resp.Body)
	for {
		line, readErr := rd.ReadString('\n')
		if readErr != nil && readErr != io.EOF {
			sendEvent(llmSSEEventDelta{Error: "read upstream stream failed"})
			return
		}
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "data:") {
			payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if payload == "[DONE]" {
				sendEvent(llmSSEEventDelta{Done: true})
				return
			}
			if payload == "" {
				if readErr == io.EOF {
					sendEvent(llmSSEEventDelta{Done: true})
					return
				}
				continue
			}

			var chunk openAIChatChunk
			if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
				// Ignore unparseable chunks; keep streaming.
				if readErr == io.EOF {
					sendEvent(llmSSEEventDelta{Done: true})
					return
				}
				continue
			}
			if len(chunk.Choices) > 0 {
				delta := chunk.Choices[0].Delta.Content
				if delta != "" {
					sendEvent(llmSSEEventDelta{Delta: delta})
				}
			}
		}

		if readErr == io.EOF {
			sendEvent(llmSSEEventDelta{Done: true})
			return
		}
	}
}

func (s *Server) loadLLMProvidersConfig(ctx context.Context) (*llmProvidersConfig, error) {
	// Note: keep using the generic dict CRUD API already implemented in runtime.
	row, ok, err := s.store.GetDict(ctx, llmConfigDictType, llmConfigProvidersLabel)
	if err != nil {
		return nil, err
	}
	if !ok || strings.TrimSpace(row.Value) == "" {
		return &llmProvidersConfig{Version: 1, Providers: []llmProvider{}}, nil
	}
	var cfg llmProvidersConfig
	if err := json.Unmarshal([]byte(row.Value), &cfg); err != nil {
		return nil, fmt.Errorf("parse llm providers config: %w", err)
	}
	if cfg.Version == 0 {
		cfg.Version = 1
	}
	if cfg.Providers == nil {
		cfg.Providers = []llmProvider{}
	}
	return &cfg, nil
}

func findProvider(providers []llmProvider, providerId string) *llmProvider {
	for i := range providers {
		if strings.TrimSpace(providers[i].Id) == providerId {
			return &providers[i]
		}
	}
	return nil
}

func findModel(models []llmProviderModel, modelId string) *llmProviderModel {
	for i := range models {
		if strings.TrimSpace(models[i].Id) == modelId {
			return &models[i]
		}
	}
	return nil
}

func chatCompletionsEndpoint(apiURL string) (string, error) {
	apiURL = strings.TrimSpace(apiURL)
	if apiURL == "" {
		return "", fmt.Errorf("api_url is required")
	}
	apiURL = strings.TrimRight(apiURL, "/")
	// If the user already provides ".../chat/completions", use it directly.
	if strings.Contains(apiURL, "/chat/completions") {
		return apiURL, nil
	}
	if strings.HasSuffix(apiURL, "/v1") {
		return apiURL + "/chat/completions", nil
	}
	// Assume apiURL is already a base (including /v1 or not); still append.
	return apiURL + "/chat/completions", nil
}

