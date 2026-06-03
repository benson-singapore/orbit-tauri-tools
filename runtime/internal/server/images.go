package server

import (
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
)

const maxImageUploadBytes int64 = 20 << 20 // 20 MiB

var allowedImageExt = map[string]struct{}{
	".png":  {},
	".jpg":  {},
	".jpeg": {},
	".gif":  {},
	".webp": {},
	".bmp":  {},
	".svg":  {},
	".ico":  {},
	".avif": {},
}

func (s *Server) handleUploadImage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	if s.imgbb == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorBody("image upload service unavailable"))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxImageUploadBytes)
	if err := r.ParseMultipartForm(maxImageUploadBytes); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid multipart body or file too large"))
		return
	}
	file, fh, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody("file is required"))
		return
	}
	defer file.Close()

	if fh.Size > maxImageUploadBytes {
		writeJSON(w, http.StatusBadRequest, errorBody("file too large (max 20MB)"))
		return
	}
	if err := validateImageExt(fh); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(err.Error()))
		return
	}

	buf, err := io.ReadAll(io.LimitReader(file, maxImageUploadBytes+1))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody("read file failed"))
		return
	}
	if int64(len(buf)) > maxImageUploadBytes {
		writeJSON(w, http.StatusBadRequest, errorBody("file too large (max 20MB)"))
		return
	}

	result, err := s.imgbb.UploadFileBytes(r.Context(), sanitizeFilename(fh.Filename), buf)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(fmt.Sprintf("upload failed: %v", err)))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true,
		"data": map[string]any{
			"image": map[string]any{
				"url":        result.URL,
				"displayUrl": result.DisplayURL,
				"deleteUrl":  result.DeleteURL,
			},
		},
	})
}

func (s *Server) handleUploadImageByURL(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}
	if s.imgbb == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorBody("image upload service unavailable"))
		return
	}

	var body struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid JSON body"))
		return
	}
	sourceURL := strings.TrimSpace(body.URL)
	if sourceURL == "" {
		writeJSON(w, http.StatusBadRequest, errorBody("url is required"))
		return
	}
	if !strings.HasPrefix(sourceURL, "http://") && !strings.HasPrefix(sourceURL, "https://") {
		writeJSON(w, http.StatusBadRequest, errorBody("url must start with http:// or https://"))
		return
	}

	result, err := s.imgbb.UploadFromURL(r.Context(), sourceURL)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody(fmt.Sprintf("upload failed: %v", err)))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true,
		"data": map[string]any{
			"image": map[string]any{
				"url":        result.URL,
				"displayUrl": result.DisplayURL,
				"deleteUrl":  result.DeleteURL,
			},
		},
	})
}

func validateImageExt(fh *multipart.FileHeader) error {
	name := strings.TrimSpace(fh.Filename)
	if name == "" {
		return nil
	}
	ext := strings.ToLower(filepath.Ext(name))
	if ext == "" {
		return nil
	}
	if _, ok := allowedImageExt[ext]; ok {
		return nil
	}
	return fmt.Errorf("unsupported image extension: %s", ext)
}

func sanitizeFilename(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "upload"
	}
	return filepath.Base(name)
}
