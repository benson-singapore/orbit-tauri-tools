package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

const (
	imgbbOfficialEndpoint = "https://api.imgbb.com/1/upload"
	imgbbWebHome          = "https://imgbb.com/"
	imgbbWebJSON          = "https://imgbb.com/json"
)

var imgbbTokenPattern = regexp.MustCompile(`auth_token\s*=\s*"([^"]+)"`)

type imgbbService struct {
	apiKey     string
	authToken  string
	cookie     string
	httpClient *http.Client
}

type imgbbUploadResult struct {
	URL        string `json:"url"`
	DisplayURL string `json:"display_url"`
	DeleteURL  string `json:"delete_url"`
}

type imgbbAsset struct {
	URL string `json:"url"`
}

type imgbbResponse struct {
	StatusCode int    `json:"status_code"`
	StatusText string `json:"status_txt"`
	Success    struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"success"`
	Image imgbbUploadResult `json:"image"`
	Data  struct {
		URL        string     `json:"url"`
		DisplayURL string     `json:"display_url"`
		DeleteURL  string     `json:"delete_url"`
		Image      imgbbAsset `json:"image"`
	} `json:"data"`
	Error struct {
		Message struct {
			Text string `json:"message"`
		} `json:"message"`
	} `json:"error"`
}

func newImgbbService() *imgbbService {
	jar, _ := cookiejar.New(nil)
	return &imgbbService{
		apiKey:     strings.TrimSpace(os.Getenv("IMGBB_API_KEY")),
		authToken:  strings.TrimSpace(os.Getenv("IMGBB_AUTH_TOKEN")),
		cookie:     strings.TrimSpace(os.Getenv("IMGBB_COOKIE")),
		httpClient: &http.Client{Timeout: 30 * time.Second, Jar: jar},
	}
}

func (s *imgbbService) UploadFileBytes(ctx context.Context, filename string, data []byte) (*imgbbUploadResult, error) {
	if s.apiKey != "" {
		return s.uploadOfficial(ctx, filename, "file", bytes.NewReader(data))
	}
	return s.uploadWeb(ctx, filename, "file", bytes.NewReader(data))
}

func (s *imgbbService) UploadFromURL(ctx context.Context, sourceURL string) (*imgbbUploadResult, error) {
	if s.apiKey != "" {
		return s.uploadOfficial(ctx, "", "url", strings.NewReader(sourceURL))
	}
	return s.uploadWeb(ctx, "", "url", strings.NewReader(sourceURL))
}

func (s *imgbbService) uploadOfficial(ctx context.Context, filename, uploadType string, source io.Reader) (*imgbbUploadResult, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	if err := writer.WriteField("key", s.apiKey); err != nil {
		return nil, fmt.Errorf("write key: %w", err)
	}

	switch uploadType {
	case "file":
		part, err := writer.CreateFormFile("image", filename)
		if err != nil {
			return nil, fmt.Errorf("create image field: %w", err)
		}
		if _, err := io.Copy(part, source); err != nil {
			return nil, fmt.Errorf("copy image bytes: %w", err)
		}
	case "url":
		raw, err := io.ReadAll(source)
		if err != nil {
			return nil, fmt.Errorf("read source url: %w", err)
		}
		if err := writer.WriteField("image", string(raw)); err != nil {
			return nil, fmt.Errorf("write source url: %w", err)
		}
	default:
		return nil, fmt.Errorf("unsupported upload type: %s", uploadType)
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("close multipart writer: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, imgbbOfficialEndpoint, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("upload image via official api: %w", err)
	}
	defer resp.Body.Close()

	parsed, err := decodeImgbbResponse(resp.Body)
	if err != nil {
		return nil, err
	}
	return parsed.pickResult(resp.StatusCode)
}

func (s *imgbbService) uploadWeb(ctx context.Context, filename, uploadType string, source io.Reader) (*imgbbUploadResult, error) {
	token, cookie := s.authToken, s.cookie
	if token == "" {
		fetchedToken, fetchedCookie, err := s.fetchWebSession(ctx)
		if err != nil {
			return nil, err
		}
		token, cookie = fetchedToken, fetchedCookie
	}
	if token == "" {
		return nil, fmt.Errorf("imgbb auth token missing")
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	switch uploadType {
	case "file":
		part, err := writer.CreateFormFile("source", filename)
		if err != nil {
			return nil, fmt.Errorf("create source field: %w", err)
		}
		if _, err := io.Copy(part, source); err != nil {
			return nil, fmt.Errorf("copy image bytes: %w", err)
		}
	case "url":
		raw, err := io.ReadAll(source)
		if err != nil {
			return nil, fmt.Errorf("read source url: %w", err)
		}
		if err := writer.WriteField("source", string(raw)); err != nil {
			return nil, fmt.Errorf("write source url: %w", err)
		}
	default:
		return nil, fmt.Errorf("unsupported upload type: %s", uploadType)
	}

	if err := writer.WriteField("type", uploadType); err != nil {
		return nil, fmt.Errorf("write type: %w", err)
	}
	if err := writer.WriteField("action", "upload"); err != nil {
		return nil, fmt.Errorf("write action: %w", err)
	}
	if err := writer.WriteField("timestamp", fmt.Sprintf("%d", time.Now().UnixMilli())); err != nil {
		return nil, fmt.Errorf("write timestamp: %w", err)
	}
	if err := writer.WriteField("auth_token", token); err != nil {
		return nil, fmt.Errorf("write auth_token: %w", err)
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("close multipart writer: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, imgbbWebJSON, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Origin", imgbbWebHome)
	req.Header.Set("Referer", imgbbWebHome)

	if strings.TrimSpace(cookie) != "" {
		req.Header.Set("Cookie", cookie)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("upload image via web json api: %w", err)
	}
	defer resp.Body.Close()

	parsed, err := decodeImgbbResponse(resp.Body)
	if err != nil {
		return nil, err
	}
	return parsed.pickResult(resp.StatusCode)
}

func (s *imgbbService) fetchWebSession(ctx context.Context) (token string, cookie string, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imgbbWebHome, nil)
	if err != nil {
		return "", "", err
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("fetch imgbb homepage: %w", err)
	}
	defer resp.Body.Close()

	htmlBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", fmt.Errorf("read imgbb homepage: %w", err)
	}
	match := imgbbTokenPattern.FindStringSubmatch(string(htmlBytes))
	if len(match) > 1 {
		token = strings.TrimSpace(match[1])
	}

	parsedURL, parseErr := url.Parse(imgbbWebHome)
	if parseErr == nil && s.httpClient.Jar != nil {
		cookies := s.httpClient.Jar.Cookies(parsedURL)
		if len(cookies) > 0 {
			pairs := make([]string, 0, len(cookies))
			for _, c := range cookies {
				pairs = append(pairs, c.Name+"="+c.Value)
			}
			cookie = strings.Join(pairs, "; ")
		}
	}
	return token, cookie, nil
}

func decodeImgbbResponse(body io.Reader) (*imgbbResponse, error) {
	raw, err := io.ReadAll(body)
	if err != nil {
		return nil, fmt.Errorf("read imgbb response: %w", err)
	}
	var out imgbbResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode imgbb response: %w", err)
	}
	return &out, nil
}

func (r *imgbbResponse) pickResult(httpStatus int) (*imgbbUploadResult, error) {
	result := &imgbbUploadResult{
		URL:        strings.TrimSpace(r.Image.URL),
		DisplayURL: strings.TrimSpace(r.Image.DisplayURL),
		DeleteURL:  strings.TrimSpace(r.Image.DeleteURL),
	}
	if result.URL == "" && strings.TrimSpace(r.Data.URL) != "" {
		result.URL = strings.TrimSpace(r.Data.URL)
		result.DisplayURL = strings.TrimSpace(r.Data.DisplayURL)
		result.DeleteURL = strings.TrimSpace(r.Data.DeleteURL)
		if result.URL == "" {
			result.URL = strings.TrimSpace(r.Data.Image.URL)
		}
	}
	if result.URL != "" {
		return result, nil
	}

	msg := strings.TrimSpace(r.Error.Message.Text)
	if msg == "" {
		msg = strings.TrimSpace(r.Success.Message)
	}
	if msg == "" {
		msg = strings.TrimSpace(r.StatusText)
	}
	if msg == "" {
		msg = fmt.Sprintf("imgbb upload failed, status=%d", httpStatus)
	}
	return nil, fmt.Errorf("%s", msg)
}
