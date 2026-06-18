package plugin

import "testing"

func TestNormalizeContentRating(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"general", ContentRatingGeneral},
		{" mature ", ContentRatingMature},
		{"under18", ContentRatingUnder18},
		{"", ""},
		{"teen", ""},
	}
	for _, tc := range tests {
		if got := NormalizeContentRating(tc.in); got != tc.want {
			t.Fatalf("NormalizeContentRating(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestIsGlobalAggregateFeed(t *testing.T) {
	if !isGlobalAggregateFeed("", nil) {
		t.Fatal("expected empty plugin id to be global aggregate")
	}
	if !isGlobalAggregateFeed("all", nil) {
		t.Fatal("expected all plugin id to be global aggregate")
	}
	if isGlobalAggregateFeed("all", []string{"rss-foo"}) {
		t.Fatal("scoped feed should not be global aggregate")
	}
	if isGlobalAggregateFeed("rss-foo", nil) {
		t.Fatal("single plugin feed should not be global aggregate")
	}
}
