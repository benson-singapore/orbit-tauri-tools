package plugin

import "testing"

func TestChapterListHasMore(t *testing.T) {
	if !chapterListHasMore(20, 40, false) {
		t.Fatal("expected more while cached pages remain")
	}
	if chapterListHasMore(40, 40, false) {
		t.Fatal("expected no more when cache exhausted and api done")
	}
	if !chapterListHasMore(40, 40, true) {
		t.Fatal("expected more when api still has pages")
	}
}

func TestChapterPageItems(t *testing.T) {
	items := make([]FeedItem, 25)
	for i := range items {
		items[i] = FeedItem{ID: string(rune('a' + i))}
	}
	first := chapterPageItems(items, 20, 0)
	if len(first) != 20 {
		t.Fatalf("first page len = %d, want 20", len(first))
	}
	second := chapterPageItems(items, 20, 20)
	if len(second) != 5 {
		t.Fatalf("second page len = %d, want 5", len(second))
	}
}
