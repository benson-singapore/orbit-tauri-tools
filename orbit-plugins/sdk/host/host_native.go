//go:build !wasm

package host

import (
	"io"
	"net/http"
	"time"
)

// HTTPGet performs an HTTP GET (native dev without WASM host).
func HTTPGet(url string, headers map[string]string) ([]byte, int, error) {
	return doHTTP(http.MethodGet, url, headers, "")
}

func doHTTP(method, url string, headers map[string]string, body string) ([]byte, int, error) {
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		return nil, 0, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, 0, err
	}
	return data, resp.StatusCode, nil
}

// NowUnix returns the current unix timestamp.
func NowUnix() int64 {
	return time.Now().Unix()
}
