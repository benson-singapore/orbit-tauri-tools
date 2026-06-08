package plugin

import (
	"testing"

	"github.com/orbit-tauri-tools/runtime/internal/store"
)

func TestRowNeedsContentBackfill(t *testing.T) {
	tests := []struct {
		name string
		row  store.FeedItemRow
		want bool
	}{
		{
			name: "article with summary but no content",
			row: store.FeedItemRow{
				Title:       "Hello",
				Summary:     "summary",
				MediaType:   "text",
				PayloadJSON: `{"content":""}`,
			},
			want: true,
		},
		{
			name: "article with neither summary nor content",
			row: store.FeedItemRow{
				Title:       "Hello",
				MediaType:   "text",
				PayloadJSON: `{"content":""}`,
			},
			want: true,
		},
		{
			name: "article with content",
			row: store.FeedItemRow{
				Title:       "Hello",
				Summary:     "summary",
				MediaType:   "text",
				PayloadJSON: `{"content":"<p>body</p>"}`,
			},
			want: false,
		},
		{
			name: "video item without content",
			row: store.FeedItemRow{
				Title:     "Clip",
				MediaType: "video",
			},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := rowNeedsContentBackfill(tt.row); got != tt.want {
				t.Fatalf("rowNeedsContentBackfill() = %v, want %v", got, tt.want)
			}
		})
	}
}
