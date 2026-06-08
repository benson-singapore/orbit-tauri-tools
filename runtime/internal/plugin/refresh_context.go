package plugin

import (
	"context"
	"sync"
	"time"
)

func (r *Registry) detachRefreshContext(parent context.Context, rec *PluginRecord, channelID string) (context.Context, context.CancelFunc) {
	channelCount := len(rec.Config.Channels)
	if channelCount == 0 {
		channelCount = 1
	}
	if channelID != "" {
		channelCount = 1
	}

	timeout := 60 * time.Second
	if rec.Source == SourceWASM {
		ms := rec.Config.Wasm.TimeoutMs
		if ms <= 0 {
			ms = DefaultWasmConfig().TimeoutMs
		}
		timeout = time.Duration(ms) * time.Millisecond * time.Duration(channelCount)
	}
	return context.WithTimeout(context.WithoutCancel(parent), timeout)
}

func (r *Registry) pluginRefreshMutex(pluginID string) *sync.Mutex {
	v, _ := r.refreshMu.LoadOrStore(pluginID, &sync.Mutex{})
	return v.(*sync.Mutex)
}
