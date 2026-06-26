package server

import (
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var youtubeVideoIDPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{11}$`)

const youtubeEmbedHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe
    id="yt-player"
    src="{{.EmbedSrc}}"
    title="{{.Title}}"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
    allowfullscreen
    referrerpolicy="strict-origin-when-cross-origin"
  ></iframe>
  <script>
    (function () {
      var player = document.getElementById("yt-player");
      if (!player) return;

      window.addEventListener("message", function (event) {
        if (event.source === window.parent && player.contentWindow) {
          player.contentWindow.postMessage(event.data, "*");
          return;
        }
        if (event.source === player.contentWindow) {
          window.parent.postMessage(event.data, "*");
        }
      });
    })();
  </script>
</body>
</html>`

var youtubeEmbedTemplate = template.Must(template.New("youtube_embed").Parse(youtubeEmbedHTML))

func (s *Server) handleYouTubeEmbed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, errorBody("method not allowed"))
		return
	}

	videoID := strings.TrimSpace(r.URL.Query().Get("v"))
	if !youtubeVideoIDPattern.MatchString(videoID) {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid video id"))
		return
	}

	title := strings.TrimSpace(r.URL.Query().Get("title"))
	if title == "" {
		title = "YouTube video"
	}

	enableJSAPI := strings.TrimSpace(r.URL.Query().Get("jsapi")) == "1"
	origin := fmt.Sprintf("http://%s", r.Host)

	params := []string{"rel=0", "modestbranding=1", "fs=1"}
	if enableJSAPI {
		params = append(params, "enablejsapi=1", "origin="+url.QueryEscape(origin))
	}
	if startRaw := strings.TrimSpace(r.URL.Query().Get("start")); startRaw != "" {
		if start, err := strconv.Atoi(startRaw); err == nil && start > 0 {
			params = append(params, fmt.Sprintf("start=%d", start))
		}
	}

	embedSrc := fmt.Sprintf(
		"https://www.youtube.com/embed/%s?%s",
		videoID,
		strings.Join(params, "&"),
	)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if err := youtubeEmbedTemplate.Execute(w, map[string]string{
		"EmbedSrc": embedSrc,
		"Title":    title,
	}); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorBody("render embed failed"))
	}
}
