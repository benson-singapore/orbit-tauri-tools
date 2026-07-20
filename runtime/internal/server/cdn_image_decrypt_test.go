package server

import (
	"bytes"
	"image/jpeg"
	"io"
	"net/http"
	"net/url"
	"os"
	"testing"

	"golang.org/x/image/webp"
)

func TestIsLbupupImageHost(t *testing.T) {
	t.Parallel()
	if !isLbupupImageHost("pic.lbupup.cn") {
		t.Fatal("expected pic.lbupup.cn")
	}
	if !isLbupupImageHost("pic.uforxk.cn") {
		t.Fatal("expected pic.uforxk.cn")
	}
	if !isLbupupImageHost("pic.ssyxpo.cn") {
		t.Fatal("expected pic.ssyxpo.cn")
	}
	if isLbupupImageHost("img3.doubanio.com") {
		t.Fatal("did not expect douban host")
	}
}

func TestIsBgezuwImageHost(t *testing.T) {
	t.Parallel()
	if !isBgezuwImageHost("llksqimg.bgezuw.cn") {
		t.Fatal("expected llksqimg.bgezuw.cn")
	}
	if !isBgezuwImageHost("cdn.bgezuw.cn") {
		t.Fatal("expected cdn.bgezuw.cn")
	}
	if isBgezuwImageHost("img3.doubanio.com") {
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
	if os.Getenv("RUN_CDN_TEST") == "" {
		t.Skip("set RUN_CDN_TEST=1 to run")
	}

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
	if os.Getenv("RUN_CDN_TEST") == "" {
		t.Skip("set RUN_CDN_TEST=1 to run")
	}

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

func TestDecryptSsyxpoImageFixture(t *testing.T) {
	t.Parallel()
	if os.Getenv("RUN_CDN_TEST") == "" {
		t.Skip("set RUN_CDN_TEST=1 to run")
	}

	const encryptedURL = "https://pic.ssyxpo.cn/upload_01/upload/20260706/2026070621471621327.jpeg"
	req, err := http.NewRequest(http.MethodGet, encryptedURL, nil)
	if err != nil {
		t.Fatal(err)
	}
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
	img, err := jpeg.Decode(bytes.NewReader(plain))
	if err != nil {
		t.Fatalf("jpeg decode: %v", err)
	}
	b := img.Bounds()
	if b.Dx() != 800 || b.Dy() != 450 {
		t.Fatalf("size got %dx%d want 800x450", b.Dx(), b.Dy())
	}
}

func testDecryptBgezuwImageURL(t *testing.T, encryptedURL string) {
	t.Helper()
	testDecryptBgezuwJPEGImageURL(t, encryptedURL, 0, 0)
}

func testDecryptBgezuwJPEGImageURL(t *testing.T, encryptedURL string, wantW, wantH int) {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, encryptedURL, nil)
	if err != nil {
		t.Fatal(err)
	}
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
	img, err := jpeg.Decode(bytes.NewReader(plain))
	if err != nil {
		t.Fatalf("jpeg decode: %v", err)
	}
	if wantW > 0 || wantH > 0 {
		b := img.Bounds()
		if b.Dx() != wantW || b.Dy() != wantH {
			t.Fatalf("size got %dx%d want %dx%d", b.Dx(), b.Dy(), wantW, wantH)
		}
	}
}

func TestDecryptBgezuwImageFixture(t *testing.T) {
	t.Parallel()

	const encryptedURL = "https://llksqimg.bgezuw.cn/v3/image/2ph/14t/14k/1mf/6acddfb5796b423325e21e3badb03555.jpeg"
	testDecryptBgezuwImageURL(t, encryptedURL)
}

func TestDecryptBgezuwImageFixtureShortHeader(t *testing.T) {
	t.Parallel()

	const encryptedURL = "https://llksqimg.bgezuw.cn/v3/image/7q/1tf/11v/30h/38603059fc9cce1bec54fef54e5f2b35.jpg"
	testDecryptBgezuwImageURL(t, encryptedURL)
}

func TestDecryptBgezuwImageFixtureUserJPEG(t *testing.T) {
	t.Parallel()

	const encryptedURL = "https://llksqimg.bgezuw.cn/v3/image/10k/1vu/2j9/v1/b32756808979961e353735d6ba68c59c.jpg"
	testDecryptBgezuwJPEGImageURL(t, encryptedURL, 400, 533)
}

func TestDecryptBgezuwImageFixtureWebP(t *testing.T) {
	t.Parallel()

	const encryptedURL = "https://llksqimg.bgezuw.cn/v3/image/20u/b9/2r9/7s/e9214758cd9401d8e4e8ebead09a3a12.webp"
	testDecryptBgezuwWebPImageURL(t, encryptedURL)
}

func TestDecryptBgezuwImageFixtureUserWebP(t *testing.T) {
	t.Parallel()

	const encryptedURL = "https://llksqimg.bgezuw.cn/v3/image/2d/2lr/1j0/6w/ac813b4dcd6864bf57dae4053aac361b.webp"
	testDecryptBgezuwWebPImageURL(t, encryptedURL)
}

func testDecryptBgezuwWebPImageURL(t *testing.T, encryptedURL string) {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, encryptedURL, nil)
	if err != nil {
		t.Fatal(err)
	}
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
	if contentType != "image/webp" {
		t.Fatalf("content-type %q", contentType)
	}
	if !isBgezuwWebPBytes(plain) {
		t.Fatalf("expected webp, got %02x %02x %02x %02x", plain[0], plain[1], plain[2], plain[3])
	}
	if _, err := webp.Decode(bytes.NewReader(plain)); err != nil {
		t.Fatalf("webp decode: %v", err)
	}
}

func TestIsImageContentTypeBinaryOctetStream(t *testing.T) {
	t.Parallel()
	if !isImageContentType("binary/octet-stream") {
		t.Fatal("expected binary/octet-stream")
	}
}
