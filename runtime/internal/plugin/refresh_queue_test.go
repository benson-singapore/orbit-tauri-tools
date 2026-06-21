package plugin

import (
	"testing"
	"time"
)

func TestRefreshQueuePriorityAndDedup(t *testing.T) {
	q := newRefreshQueue(&Registry{})

	q.enqueue(refreshJob{
		pluginID:  "p1",
		channelID: "c1",
		priority:  priorityBackground,
		readyAt:   time.Now().Add(time.Hour),
	})
	q.enqueue(refreshJob{
		pluginID:  "p1",
		channelID: "c1",
		priority:  priorityInteractive,
		readyAt:   time.Now(),
	})

	job, ok := q.popNextReady()
	if !ok {
		t.Fatal("expected ready interactive job")
	}
	if job.priority != priorityInteractive {
		t.Fatalf("expected interactive priority, got %d", job.priority)
	}

	q.enqueue(refreshJob{
		pluginID:  "p1",
		channelID: "c2",
		priority:  priorityBackground,
		readyAt:   time.Now().Add(time.Hour),
	})
	q.enqueue(refreshJob{
		pluginID:  "p1",
		channelID: "c2",
		priority:  priorityBackground,
		readyAt:   time.Now().Add(30 * time.Minute),
	})
	if _, ok := q.pending[refreshJobKey("p1", "c2")]; !ok {
		t.Fatal("expected pending background job")
	}
	queued := q.pending[refreshJobKey("p1", "c2")]
	if queued.readyAt.After(time.Now().Add(40 * time.Minute)) {
		t.Fatal("expected earlier ready time to be preserved for same priority")
	}
}

func TestRefreshQueuePopHighestPriority(t *testing.T) {
	q := newRefreshQueue(&Registry{})
	now := time.Now()
	q.enqueue(refreshJob{
		pluginID:  "p1",
		channelID: "slow",
		priority:  priorityBackground,
		readyAt:   now,
	})
	q.enqueue(refreshJob{
		pluginID:  "p1",
		channelID: "fast",
		priority:  priorityInteractive,
		readyAt:   now,
	})

	job, ok := q.popNextReady()
	if !ok || job.channelID != "fast" {
		t.Fatalf("expected interactive job first, got %+v ok=%v", job, ok)
	}
}
