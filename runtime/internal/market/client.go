package market

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const defaultAPIBase = "https://orbit-api.nnbtech.com/api"

type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

func NewClient() *Client {
	base := strings.TrimSpace(os.Getenv("ORBIT_API_URL"))
	if base == "" {
		base = defaultAPIBase
	}
	return &Client{
		BaseURL: strings.TrimRight(base, "/"),
		HTTPClient: &http.Client{
			Timeout: 2 * time.Minute,
		},
	}
}

type artifact struct {
	ArtifactType   string `json:"artifactType"`
	StoragePath    string `json:"storagePath"`
	ChecksumSha256 string `json:"checksumSha256"`
}

type downloadResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    struct {
		Artifacts []artifact `json:"artifacts"`
	} `json:"data"`
}

// DownloadOrbitPackage requests a market plugin download URL and fetches the .orbit zip bytes.
func (c *Client) DownloadOrbitPackage(ctx context.Context, marketID string) ([]byte, error) {
	marketID = strings.TrimSpace(marketID)
	if marketID == "" {
		return nil, fmt.Errorf("market plugin id is required")
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.BaseURL+"/v1/plugins/"+marketID+"/download",
		http.NoBody,
	)
	if err != nil {
		return nil, err
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request market download: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read market download response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("market download failed: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed downloadResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("parse market download response: %w", err)
	}
	if parsed.Code != 200 || len(parsed.Data.Artifacts) == 0 {
		msg := strings.TrimSpace(parsed.Message)
		if msg == "" {
			msg = "no artifacts in market download response"
		}
		return nil, fmt.Errorf("market download: %s", msg)
	}

	var selected *artifact
	for i := range parsed.Data.Artifacts {
		a := &parsed.Data.Artifacts[i]
		if a.ArtifactType == "orbit" || strings.HasSuffix(strings.ToLower(a.StoragePath), ".orbit") {
			selected = a
			break
		}
	}
	if selected == nil {
		selected = &parsed.Data.Artifacts[0]
	}
	if strings.TrimSpace(selected.StoragePath) == "" {
		return nil, fmt.Errorf("market package URL missing")
	}

	pkgReq, err := http.NewRequestWithContext(ctx, http.MethodGet, selected.StoragePath, nil)
	if err != nil {
		return nil, err
	}
	pkgResp, err := c.HTTPClient.Do(pkgReq)
	if err != nil {
		return nil, fmt.Errorf("download orbit package: %w", err)
	}
	defer pkgResp.Body.Close()

	pkgData, err := io.ReadAll(io.LimitReader(pkgResp.Body, 32<<20))
	if err != nil {
		return nil, fmt.Errorf("read orbit package: %w", err)
	}
	if pkgResp.StatusCode < 200 || pkgResp.StatusCode >= 300 {
		return nil, fmt.Errorf("download orbit package failed: HTTP %d", pkgResp.StatusCode)
	}

	if expected := strings.ToLower(strings.TrimSpace(selected.ChecksumSha256)); expected != "" {
		sum := sha256.Sum256(pkgData)
		actual := hex.EncodeToString(sum[:])
		if actual != expected {
			return nil, fmt.Errorf("orbit package checksum mismatch")
		}
	}
	return pkgData, nil
}
