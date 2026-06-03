//go:build wasm

package host

import (
	"encoding/json"
	"unsafe"
)

//go:wasmimport orbit http_request
func httpRequest(reqPtr, reqLen, respPtr, respCap uint32) uint32

//go:wasmimport orbit log
func logMessage(levelPtr, levelLen, msgPtr, msgLen uint32)

//go:wasmimport orbit now_unix
func nowUnix() int64

type httpReq struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body,omitempty"`
}

type httpResp struct {
	Status int    `json:"status"`
	Body   string `json:"body"`
	Error  string `json:"error,omitempty"`
}

// HTTPGet performs an HTTP GET via the Orbit host.
func HTTPGet(url string, headers map[string]string) ([]byte, int, error) {
	return doHTTP("GET", url, headers, "")
}

func doHTTP(method, url string, headers map[string]string, body string) ([]byte, int, error) {
	reqJSON, err := json.Marshal(httpReq{Method: method, URL: url, Headers: headers, Body: body})
	if err != nil {
		return nil, 0, err
	}
	respBuf := make([]byte, 8<<20)
	n := httpRequest(
		uint32(uintptr(unsafe.Pointer(&reqJSON[0]))),
		uint32(len(reqJSON)),
		uint32(uintptr(unsafe.Pointer(&respBuf[0]))),
		uint32(len(respBuf)),
	)
	if n == 0 {
		return nil, 0, errHostHTTP
	}
	var resp httpResp
	if err := json.Unmarshal(respBuf[:n], &resp); err != nil {
		return nil, 0, err
	}
	if resp.Error != "" {
		return nil, 0, &hostError{msg: resp.Error}
	}
	return []byte(resp.Body), resp.Status, nil
}

// NowUnix returns the current unix timestamp from the host.
func NowUnix() int64 {
	return nowUnix()
}
