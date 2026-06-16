package plugin

import (
	"context"
	"log"
	"time"
)

const defaultSchedulerTick = 60 * time.Second

// StartRefreshScheduler periodically refreshes stale WASM channels with feed.refresh=true.
func (r *Registry) StartRefreshScheduler(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(defaultSchedulerTick)
		defer ticker.Stop()

		r.refreshStaleChannels(context.Background())

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				r.refreshStaleChannels(context.Background())
			}
		}
	}()
}

func (r *Registry) refreshStaleChannels(ctx context.Context) {
	now := time.Now().Unix()
	for _, rec := range r.List() {
		if !rec.Active {
			continue
		}
		if rec.Source != SourceWASM {
			continue
		}
		if !HasCapability(&rec.Manifest, CapFeed) {
			continue
		}
		interval := int64(DefaultRefreshInterval(rec.Config.RefreshInterval).Seconds())
		if interval <= 0 {
			interval = 3600
		}
		for _, ch := range rec.Config.Channels {
			if !ChannelEnabled(&ch) {
				continue
			}
			if !ChannelFeedRefresh(&ch) {
				continue
			}
			if rec.LastFetch > 0 && now-rec.LastFetch < interval {
				continue
			}
			if err := r.dispatch.ScheduledRefresh(ctx, rec.ID, ch.ID); err != nil {
				log.Printf("v2 scheduler: refresh %s/%s: %v", rec.ID, ch.ID, err)
				rec.LastError = err.Error()
			} else {
				rec.LastError = ""
				rec.LastFetch = now
			}
			_ = r.upsertPlugin(ctx, rec)
			r.setRecord(rec)
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
		rec, ok := r.Get(pluginID)
		if !ok {
			return
		}
		for _, ch := range rec.Config.Channels {
			if !ChannelEnabled(&ch) || !ChannelFeedRefresh(&ch) {
				continue
			}
			if force {
				_ = r.store.DeleteFeedItemsByChannel(ctx, pluginID, ch.ID)
			}
			if _, err := r.dispatch.Refresh(ctx, pluginID, ch.ID); err != nil {
				log.Printf("scheduled v2 refresh %s/%s: %v", pluginID, ch.ID, err)
			}
		}
	}()
}
