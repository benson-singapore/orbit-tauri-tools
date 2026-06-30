package plugin

import "testing"

func TestDefaultIncludeInAll(t *testing.T) {
	tests := []struct {
		mediaType     string
		contentRating string
		want          bool
	}{
		{MediaArticle, ContentRatingGeneral, true},
		{MediaArticle, ContentRatingUnder18, true},
		{MediaArticle, ContentRatingMature, false},
		{MediaArticle, "", true},
		{MediaNovel, ContentRatingGeneral, true},
		{MediaNovel, ContentRatingMature, false},
		{MediaVideo, ContentRatingGeneral, false},
		{MediaImage, "", false},
		{MediaManga, "", false},
		{"", "", false},
	}
	for _, tc := range tests {
		got := DefaultIncludeInAll(tc.mediaType, tc.contentRating)
		if got != tc.want {
			t.Fatalf(
				"DefaultIncludeInAll(%q, %q) = %v, want %v",
				tc.mediaType, tc.contentRating, got, tc.want,
			)
		}
	}
}
