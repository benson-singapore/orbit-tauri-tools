package plugin

import (
	"context"
	"log"
	"time"
)

const defaultSchedulerTick = 60 * time.Second

// StartRefreshScheduler periodically refreshes stale RSS and WASM feed plugins in the background.
func (r *Registry) StartRefreshScheduler(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(defaultSchedulerTick)
		defer ticker.Stop()

		r.refreshStalePlugins(context.Background())

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				r.refreshStalePlugins(context.Background())
			}
		}
	}()
}

func (r *Registry) refreshStalePlugins(ctx context.Context) {
	for _, rec := range r.List() {
		if !rec.Active {
			continue
		}
		if !HasCapability(&rec.Manifest, CapFeed) {
			continue
		}
		if rec.Source != SourceRSS && rec.Source != SourceWASM {
			continue
		}
		if !r.isStale(rec) {
			continue
		}
		if _, err := r.RefreshPlugin(ctx, rec.ID, ""); err != nil {
			log.Printf("feed scheduler: refresh %s: %v", rec.ID, err)
		}
	}
}

// ScheduleInitialRefresh runs the first fetch asynchronously after a plugin is installed.
func (r *Registry) ScheduleInitialRefresh(pluginID string) {
	r.schedulePluginRefresh(pluginID, false)
}

// ScheduleForceRefresh clears cached feed items and re-fetches asynchronously after a plugin update.
func (r *Registry) ScheduleForceRefresh(pluginID string) {
	r.schedulePluginRefresh(pluginID, true)
}

func (r *Registry) schedulePluginRefresh(pluginID string, force bool) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		var err error
		if force {
			_, err = r.ForceRefreshPlugin(ctx, pluginID, "")
		} else {
			_, err = r.RefreshPlugin(ctx, pluginID, "")
		}
		if err != nil {
			log.Printf("scheduled feed refresh %s: %v", pluginID, err)
		}
	}()
}
