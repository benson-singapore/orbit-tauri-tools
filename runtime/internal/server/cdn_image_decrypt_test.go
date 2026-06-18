package server

import (
	"io"
	"net/http"
	"net/url"
	"testing"
)

func TestIsLbupupImageHost(t *testing.T) {
	t.Parallel()
	if !isLbupupImageHost("pic.lbupup.cn") {
		t.Fatal("expected pic.lbupup.cn")
	}
	if !isLbupupImageHost("pic.uforxk.cn") {
		t.Fatal("expected pic.uforxk.cn")
	}
	if isLbupupImageHost("img3.doubanio.com") {
		t.Fatal("did not expect douban host")
	}
}

func TestLbupupImageReferer(t *testing.T) {
	t.Parallel()
	target, err := url.Parse("https://pic.lbupup.cn/upload_01/xiao/a.jpeg")
	if err != nil {
		t.Fatal(err)
	}
	if got := lbupupImageReferer(target); got != lbupupReferer {
		t.Fatalf("got %q", got)
	}
}

func TestDecryptUforxkImageFixture(t *testing.T) {
	t.Parallel()

	const encryptedURL = "https://pic.uforxk.cn/upload_01/xiao/20260616/2026061617372799575.jpeg"
	req, err := http.NewRequest(http.MethodGet, encryptedURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Referer", lbupupReferer)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		t.Fatal(err)
	}

	target, err := url.Parse(encryptedURL)
	if err != nil {
		t.Fatal(err)
	}
	plain, contentType, err := maybeDecryptProxyImage(target, body)
	if err != nil {
		t.Fatal(err)
	}
	if contentType != "image/jpeg" {
		t.Fatalf("content-type %q", contentType)
	}
	if len(plain) < 2 || plain[0] != 0xFF || plain[1] != 0xD8 {
		t.Fatalf("expected jpeg, got %02x %02x", plain[0], plain[1])
	}
}

func TestDecryptLbupupImageFixture(t *testing.T) {
	t.Parallel()

	const encryptedURL = "https://pic.lbupup.cn/upload_01/xiao/20260616/2026061613094752170.jpeg"
	req, err := http.NewRequest(http.MethodGet, encryptedURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Referer", lbupupReferer)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		t.Fatal(err)
	}

	target, err := url.Parse(encryptedURL)
	if err != nil {
		t.Fatal(err)
	}
	plain, contentType, err := maybeDecryptProxyImage(target, body)
	if err != nil {
		t.Fatal(err)
	}
	if contentType != "image/jpeg" {
		t.Fatalf("content-type %q", contentType)
	}
	if len(plain) < 2 || plain[0] != 0xFF || plain[1] != 0xD8 {
		t.Fatalf("expected jpeg, got %02x %02x", plain[0], plain[1])
	}
}

func TestIsImageContentTypeBinaryOctetStream(t *testing.T) {
	t.Parallel()
	if !isImageContentType("binary/octet-stream") {
		t.Fatal("expected binary/octet-stream")
	}
}
