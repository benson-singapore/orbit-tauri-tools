package plugin

import (
	"encoding/json"
	"fmt"
)

// mergeManifestForUpdate combines an incoming market manifest with the installed
// manifest. Existing values win on conflict; missing keys from incoming are added.
// version is always taken from the incoming manifest.
func mergeManifestForUpdate(existingJSON, incomingJSON []byte) ([]byte, error) {
	var existing, incoming map[string]any
	if err := json.Unmarshal(existingJSON, &existing); err != nil {
		return nil, fmt.Errorf("parse existing manifest: %w", err)
	}
	if err := json.Unmarshal(incomingJSON, &incoming); err != nil {
		return nil, fmt.Errorf("parse incoming manifest: %w", err)
	}

	merged := mergeMapsPreserveExisting(existing, incoming)
	if version, ok := incoming["version"]; ok {
		merged["version"] = version
	}

	out, err := json.MarshalIndent(merged, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal merged manifest: %w", err)
	}
	return append(out, '\n'), nil
}

func mergeMapsPreserveExisting(existing, incoming map[string]any) map[string]any {
	if existing == nil {
		if incoming == nil {
			return map[string]any{}
		}
		return cloneMap(incoming)
	}
	result := cloneMap(existing)
	if incoming == nil {
		return result
	}
	for key, incomingVal := range incoming {
		existingVal, exists := result[key]
		if !exists {
			result[key] = incomingVal
			continue
		}
		existingMap, existingIsMap := existingVal.(map[string]any)
		incomingMap, incomingIsMap := incomingVal.(map[string]any)
		if existingIsMap && incomingIsMap {
			result[key] = mergeMapsPreserveExisting(existingMap, incomingMap)
		}
	}
	return result
}

func cloneMap(src map[string]any) map[string]any {
	if src == nil {
		return nil
	}
	out := make(map[string]any, len(src))
	for key, val := range src {
		if nested, ok := val.(map[string]any); ok {
			out[key] = cloneMap(nested)
			continue
		}
		out[key] = val
	}
	return out
}
