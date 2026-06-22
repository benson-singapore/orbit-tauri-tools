package plugin

import (
	"context"
	"fmt"
	"strings"

	"github.com/orbit-tauri-tools/runtime/internal/store"
)

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
	return r.store.UpsertPluginVariables(ctx, pluginID, merged)
}
