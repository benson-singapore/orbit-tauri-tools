package plugin

import (
	"context"
	"time"
)

const defaultSchedulerTick = 60 * time.Second

// StartRefreshScheduler periodically refreshes stale WASM channels with feed.refresh=true.
func (r *Registry) StartRefreshScheduler(ctx context.Context) {
	r.refreshQueue.Start(ctx)

	go func() {
		ticker := time.NewTicker(defaultSchedulerTick)
		defer ticker.Stop()

		select {
		case <-ctx.Done():
			return
		case <-time.After(refreshSchedulerStartupGap):
		}
		r.enqueueStaleChannels(context.Background())

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				r.enqueueStaleChannels(context.Background())
			}
		}
	}()
}

func (r *Registry) enqueueStaleChannels(ctx context.Context) {
	delay := time.Duration(0)
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
		for _, ch := range rec.Config.Channels {
			if !ChannelEnabled(&ch) {
				continue
			}
			if !ChannelFeedRefresh(&ch) {
				continue
			}
			if !r.isChannelFeedStale(ctx, rec, &ch) {
				continue
			}
			r.refreshQueue.EnqueueStale(rec.ID, ch.ID, delay)
			delay += refreshChannelStagger
		}
	}
}

// ScheduleInitialRefresh runs the first fetch asynchronously after a plugin is installed.
func (r *Registry) ScheduleInitialRefresh(pluginID string) {
	r.refreshQueue.SchedulePluginRefresh(pluginID, false)
}

// ScheduleForceRefresh clears cached feed items and re-fetches asynchronously after a plugin update.
func (r *Registry) ScheduleForceRefresh(pluginID string) {
	r.refreshQueue.SchedulePluginRefresh(pluginID, true)
}
