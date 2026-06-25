package plugin

import (
	"context"
	"log"
	"sync"
	"time"
)

const (
	refreshInitialDelay        = 90 * time.Second
	refreshChannelStagger      = 45 * time.Second
	refreshBetweenJobs         = 3 * time.Second
	refreshSchedulerStartupGap = 30 * time.Second
	refreshWorkerPoll          = 5 * time.Second
)

type refreshPriority int

const (
	priorityBackground refreshPriority = iota
	priorityScheduled
	priorityInteractive
)

type refreshJob struct {
	pluginID   string
	channelID  string
	force      bool
	skipCached bool
	priority   refreshPriority
	readyAt    time.Time
}

func refreshJobKey(pluginID, channelID string) string {
	return pluginID + "/" + channelID
}

// RefreshQueue serializes background feed refreshes and staggers channel work
// so SQLite writes and WASM fetches do not block routine cache reads.
type RefreshQueue struct {
	registry *Registry
	mu       sync.Mutex
	pending  map[string]refreshJob
	wake     chan struct{}
}

func newRefreshQueue(reg *Registry) *RefreshQueue {
	return &RefreshQueue{
		registry: reg,
		pending:  make(map[string]refreshJob),
		wake:     make(chan struct{}, 1),
	}
}

func (q *RefreshQueue) Start(ctx context.Context) {
	go q.runWorker(ctx)
}

func (q *RefreshQueue) notify() {
	select {
	case q.wake <- struct{}{}:
	default:
	}
}

func (q *RefreshQueue) enqueue(job refreshJob) {
	q.mu.Lock()
	defer q.mu.Unlock()

	key := refreshJobKey(job.pluginID, job.channelID)
	existing, ok := q.pending[key]
	if ok {
		if job.priority < existing.priority {
			return
		}
		if job.priority == existing.priority && job.readyAt.After(existing.readyAt) {
			job.readyAt = existing.readyAt
		}
		if job.force {
			existing.force = true
		}
		if !job.skipCached {
			existing.skipCached = false
		}
		existing.priority = job.priority
		existing.readyAt = job.readyAt
		q.pending[key] = existing
		q.notify()
		return
	}
	q.pending[key] = job
	q.notify()
}

// SchedulePluginRefresh enqueues staggered background refreshes for all feed channels.
func (q *RefreshQueue) SchedulePluginRefresh(pluginID string, force bool) {
	rec, ok := q.registry.Get(pluginID)
	if !ok {
		return
	}
	idx := 0
	for _, ch := range rec.Config.Channels {
		if !ChannelEnabled(&ch) || !ChannelFeedRefresh(&ch) {
			continue
		}
		delay := refreshInitialDelay + time.Duration(idx)*refreshChannelStagger
		idx++
		q.enqueue(refreshJob{
			pluginID:   pluginID,
			channelID:  ch.ID,
			force:      force,
			skipCached: !force,
			priority:   priorityBackground,
			readyAt:    time.Now().Add(delay),
		})
	}
}

// EnqueueInteractive queues a user-facing refresh with high priority.
func (q *RefreshQueue) EnqueueInteractive(pluginID, channelID string) {
	q.enqueue(refreshJob{
		pluginID:   pluginID,
		channelID:  channelID,
		priority:   priorityInteractive,
		readyAt:    time.Now(),
		skipCached: false,
	})
}

// EnqueueStale schedules a periodic refresh for one channel.
func (q *RefreshQueue) EnqueueStale(pluginID, channelID string, delay time.Duration) {
	q.enqueue(refreshJob{
		pluginID:   pluginID,
		channelID:  channelID,
		priority:   priorityScheduled,
		readyAt:    time.Now().Add(delay),
		skipCached: true,
	})
}

func (q *RefreshQueue) runWorker(ctx context.Context) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("refresh queue worker panic: %v", rec)
		}
	}()
	for {
		job, ok := q.popNextReady()
		if !ok {
			select {
			case <-ctx.Done():
				return
			case <-q.wake:
				continue
			case <-time.After(refreshWorkerPoll):
				continue
			}
		}

		if err := q.runJob(ctx, job); err != nil {
			log.Printf("refresh queue %s/%s: %v", job.pluginID, job.channelID, err)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(refreshBetweenJobs):
		}
	}
}

func (q *RefreshQueue) popNextReady() (refreshJob, bool) {
	q.mu.Lock()
	defer q.mu.Unlock()

	now := time.Now()
	var (
		bestKey string
		best    refreshJob
		found   bool
	)
	for key, job := range q.pending {
		if job.readyAt.After(now) {
			continue
		}
		if !found ||
			job.priority > best.priority ||
			(job.priority == best.priority && job.readyAt.Before(best.readyAt)) {
			bestKey = key
			best = job
			found = true
		}
	}
	if !found {
		return refreshJob{}, false
	}
	delete(q.pending, bestKey)
	return best, true
}

func (q *RefreshQueue) runJob(ctx context.Context, job refreshJob) error {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("refresh queue %s/%s panic: %v", job.pluginID, job.channelID, rec)
		}
	}()
	rec, ok := q.registry.Get(job.pluginID)
	if !ok || !rec.Active {
		return nil
	}
	ch, ok := findChannel(rec.Config.Channels, job.channelID)
	if !ok || !ChannelEnabled(ch) || !ChannelFeedRefresh(ch) {
		return nil
	}

	if job.skipCached {
		hasCache, err := q.registry.channelHasCachedFeed(ctx, job.pluginID, job.channelID)
		if err != nil {
			return err
		}
		if hasCache {
			return nil
		}
	}

	if _, err := q.registry.MergePluginVars(ctx, rec); err != nil {
		rec.LastError = err.Error()
		now := time.Now().Unix()
		rec.LastFetch = now
		_ = q.registry.upsertPlugin(ctx, rec)
		q.registry.setRecord(rec)
		return nil
	}

	var err error
	if job.force {
		_, err = q.registry.dispatch.ClearAndRefresh(ctx, job.pluginID, job.channelID)
	} else {
		err = q.registry.dispatch.ScheduledRefresh(ctx, job.pluginID, job.channelID)
	}
	if err != nil {
		rec.LastError = err.Error()
	} else {
		rec.LastError = ""
	}
	now := time.Now().Unix()
	rec.LastFetch = now
	_ = q.registry.upsertPlugin(ctx, rec)
	q.registry.setRecord(rec)
	return err
}

func (r *Registry) channelHasCachedFeed(ctx context.Context, pluginID, channelID string) (bool, error) {
	count, err := r.store.CountFeedItemsForChannel(ctx, pluginID, channelID)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *Registry) isChannelFeedStale(ctx context.Context, rec *PluginRecord, ch *FeedChannel) bool {
	interval := int64(DefaultRefreshInterval(rec.Config.RefreshInterval).Seconds())
	if interval <= 0 {
		interval = 3600
	}
	lastFetch, err := r.store.MaxFeedFetchedAtForChannel(ctx, rec.ID, ch.ID)
	if err != nil || lastFetch == 0 {
		return true
	}
	return time.Now().Unix()-lastFetch >= interval
}
