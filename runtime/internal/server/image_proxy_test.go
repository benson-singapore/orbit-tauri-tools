package server

import (
	"net/url"
	"testing"
)

func TestValidateImageProxyTarget(t *testing.T) {
	t.Parallel()

	cases := []struct {
		raw     string
		wantErr bool
	}{
		{"https://img3.doubanio.com/view/photo/m_ratio_poster/public/p2932678292.jpg", false},
		{"http://img3.doubanio.com/a.jpg", false},
		{"ftp://img3.doubanio.com/a.jpg", true},
		{"https://localhost/a.jpg", true},
		{"https://127.0.0.1/a.jpg", true},
		{"https://10.0.0.1/a.jpg", true},
	}

	for _, tc := range cases {
		parsed, err := url.Parse(tc.raw)
		if err != nil {
			t.Fatalf("parse %q: %v", tc.raw, err)
		}
		err = validateImageProxyTarget(parsed)
		if tc.wantErr && err == nil {
			t.Fatalf("expected error for %q", tc.raw)
		}
		if !tc.wantErr && err != nil {
			t.Fatalf("unexpected error for %q: %v", tc.raw, err)
		}
	}
}

func TestImageProxyReferer(t *testing.T) {
	t.Parallel()

	parsed, err := url.Parse("https://img3.doubanio.com/view/photo/x.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if got := imageProxyReferer(parsed); got != "https://img3.doubanio.com" {
		t.Fatalf("got %q", got)
	}
}

func TestIsImageContentType(t *testing.T) {
	t.Parallel()

	if !isImageContentType("image/jpeg") {
		t.Fatal("expected image/jpeg")
	}
	if !isImageContentType("image/jpeg; charset=binary") {
		t.Fatal("expected image/jpeg with params")
	}
	if isImageContentType("text/html") {
		t.Fatal("did not expect text/html")
	}
}
