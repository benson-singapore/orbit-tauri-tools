package plugin

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/orbit-tauri-tools/runtime/internal/store"
)

func sessionVarKeys(cfg BrowserConfig) []string {
	if cfg.HasSessionConfig() {
		persist := append([]string(nil), cfg.Persist...)
		if len(persist) == 0 {
			persist = []string{"cookie", "userAgent"}
		}
		return persist
	}
	return []string{"cookie", "userAgent"}
}

func (r *Registry) MergePluginVars(ctx context.Context, rec *PluginRecord) (map[string]string, error) {
	out := make(map[string]string)
	for key, def := range rec.Config.Variables {
		val := strings.TrimSpace(def.Default)
		if stored, ok, err := r.store.GetPluginVariable(ctx, rec.ID, key); err != nil {
			return nil, err
		} else if ok {
			val = stored
		}
		if def.Required && strings.TrimSpace(val) == "" {
			return nil, missingVariableError(key, def)
		}
		if val != "" {
			out[key] = val
		}
	}
	for _, key := range sessionVarKeys(rec.Config.Browser) {
		if _, exists := out[key]; exists {
			continue
		}
		stored, ok, err := r.store.GetPluginVariable(ctx, rec.ID, key)
		if err != nil {
			return nil, err
		}
		if ok && strings.TrimSpace(stored) != "" {
			out[key] = stored
		}
	}
	logPluginVars(rec.ID, out)
	return out, nil
}

func missingVariableError(key string, def VariableDefinition) error {
	label := strings.TrimSpace(def.Label)
	if label == "" {
		label = key
	}
	return fmt.Errorf("缺少必要参数：%s", label)
}

func (r *Registry) PluginVariablesReady(ctx context.Context, rec *PluginRecord) bool {
	if rec == nil || len(rec.Config.Variables) == 0 {
		return true
	}
	for key, def := range rec.Config.Variables {
		if !def.Required {
			continue
		}
		val := strings.TrimSpace(def.Default)
		stored, ok, err := r.store.GetPluginVariable(ctx, rec.ID, key)
		if err != nil {
			return false
		}
		if ok {
			val = stored
		}
		if strings.TrimSpace(val) == "" {
			return false
		}
	}
	return true
}

func (r *Registry) GetPluginVariablesSchema(rec *PluginRecord) map[string]VariableDefinition {
	if rec == nil || len(rec.Config.Variables) == 0 {
		return map[string]VariableDefinition{}
	}
	out := make(map[string]VariableDefinition, len(rec.Config.Variables))
	for k, v := range rec.Config.Variables {
		out[k] = v
	}
	return out
}

func (r *Registry) GetPluginVariablesMasked(ctx context.Context, rec *PluginRecord) (map[string]string, error) {
	stored, err := r.store.ListPluginVariables(ctx, rec.ID)
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rec.Config.Variables))
	for key, def := range rec.Config.Variables {
		val := strings.TrimSpace(stored[key])
		if val == "" {
			val = strings.TrimSpace(def.Default)
		}
		if def.Secret && val != "" {
			out[key] = store.MaskSecretValue(val)
		} else {
			out[key] = val
		}
	}
	return out, nil
}

func (r *Registry) SavePluginVariables(ctx context.Context, pluginID string, values map[string]string) error {
	rec, ok := r.Get(pluginID)
	if !ok {
		return fmt.Errorf("plugin not found: %s", pluginID)
	}
	clearSessionKeys := make([]string, 0)
	merged := make(map[string]string, len(values))
	for key, def := range rec.Config.Variables {
		val := strings.TrimSpace(values[key])
		if val == "" {
			val = strings.TrimSpace(def.Default)
		}
		if val != "" {
			stored, hasStored, err := r.store.GetPluginVariable(ctx, pluginID, key)
			if err != nil {
				return err
			}
			if hasStored && stored != "" && val == store.MaskSecretValue(stored) {
				merged[key] = stored
				continue
			}
		}
		if def.Required && val == "" {
			return missingVariableError(key, def)
		}
		if val != "" {
			merged[key] = val
		}
	}
	for _, key := range sessionVarKeys(rec.Config.Browser) {
		val := strings.TrimSpace(values[key])
		if val == "" {
			if _, provided := values[key]; provided {
				clearSessionKeys = append(clearSessionKeys, key)
			}
			continue
		}
		if stored, hasStored, err := r.store.GetPluginVariable(ctx, pluginID, key); err != nil {
			return err
		} else if hasStored && stored != "" && val == store.MaskSecretValue(stored) {
			merged[key] = stored
			continue
		}
		merged[key] = val
	}
	if err := r.store.DeletePluginVariablesByKeys(ctx, pluginID, clearSessionKeys); err != nil {
		return err
	}
	log.Printf(
		"[orbit-session] save plugin=%q input_keys=%v merged_keys=%v cookie=%s user_agent=%s",
		pluginID,
		mapKeys(values),
		mapKeys(merged),
		describeCookieHeader(merged["cookie"]),
		describeUserAgent(merged["userAgent"]),
	)
	return r.store.UpsertPluginVariables(ctx, pluginID, merged)
}

func mapKeys(m map[string]string) []string {
	if len(m) == 0 {
		return nil
	}
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	return keys
}
