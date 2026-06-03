package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/orbit-tauri-tools/plugin-sdk"
	"github.com/orbit-tauri-tools/plugin-sdk/host"
)

func main() {
	sdk.Run(&JuejinPlugin{})
}

type JuejinPlugin struct{}

func (p *JuejinPlugin) Fetch(req *sdk.FetchRequest) (*sdk.FeedResult, error) {
	switch {
	case req.Route == "/juejin/trending":
		return fetchTrending()
	case req.Route == "/juejin/category/:category":
		category := req.Params["category"]
		if category == "" {
			category = "frontend"
		}
		return fetchByCategory(category)
	default:
		return nil, fmt.Errorf("unknown route: %s", req.Route)
	}
}

var categoryIDMap = map[string]string{
	"frontend": "6809637767543259144",
	"backend":  "6809637769959178254",
	"android":  "6809635626879549448",
	"ios":      "6809635626661445640",
	"ai":       "6809637773935869959",
}

func fetchTrending() (*sdk.FeedResult, error) {
	url := "https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot"
	return doFetch(url, "掘金热榜", "掘金全站热门文章")
}

func fetchByCategory(category string) (*sdk.FeedResult, error) {
	cid, ok := categoryIDMap[category]
	if !ok {
		return nil, fmt.Errorf("unknown category: %s", category)
	}
	url := fmt.Sprintf(
		"https://api.juejin.cn/content_api/v1/content/article_rank?category_id=%s&type=hot",
		cid,
	)
	return doFetch(url, fmt.Sprintf("掘金 · %s", category), "")
}

func doFetch(url, title, desc string) (*sdk.FeedResult, error) {
	body, status, err := host.HTTPGet(url, map[string]string{
		"Accept": "application/json",
	})
	if err != nil {
		return nil, fmt.Errorf("http get failed: %w", err)
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("http status %d", status)
	}

	items, err := parseJuejinFeed(body)
	if err != nil {
		return nil, err
	}

	return &sdk.FeedResult{Title: title, Description: desc, Items: items}, nil
}

func parseJuejinFeed(body []byte) ([]sdk.FeedItem, error) {
	var envelope struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	if len(envelope.Data) == 0 || string(envelope.Data) == `""` {
		return nil, fmt.Errorf("empty feed data")
	}

	// Current content_api shape (content + author).
	var modern []struct {
		Content struct {
			ContentID string `json:"content_id"`
			Title     string `json:"title"`
			Brief     string `json:"brief"`
			Ctime     int64  `json:"ctime"`
		} `json:"content"`
		Author struct {
			Name string `json:"name"`
		} `json:"author"`
	}
	if err := json.Unmarshal(envelope.Data, &modern); err == nil && len(modern) > 0 {
		items := make([]sdk.FeedItem, 0, len(modern))
		for _, row := range modern {
			id := strings.TrimSpace(row.Content.ContentID)
			if id == "" || strings.TrimSpace(row.Content.Title) == "" {
				continue
			}
			ts := row.Content.Ctime
			if ts == 0 {
				ts = host.NowUnix()
			}
			items = append(items, sdk.FeedItem{
				ID:          id,
				Title:       row.Content.Title,
				URL:         "https://juejin.cn/post/" + id,
				Summary:     row.Content.Brief,
				Author:      row.Author.Name,
				PublishedAt: time.Unix(ts, 0).Format(time.RFC3339),
			})
		}
		if len(items) > 0 {
			return items, nil
		}
	}

	// Legacy recommend_api shape (article_info).
	var legacy []struct {
		ArticleID   string `json:"article_id"`
		ArticleInfo struct {
			Title        string `json:"title"`
			BriefContent string `json:"brief_content"`
			CoverImage   string `json:"cover_image"`
			Ctime        string `json:"ctime"`
		} `json:"article_info"`
		AuthorUserInfo struct {
			Username string `json:"user_name"`
		} `json:"author_user_info"`
	}
	if err := json.Unmarshal(envelope.Data, &legacy); err != nil {
		return nil, fmt.Errorf("parse feed items: %w", err)
	}
	items := make([]sdk.FeedItem, 0, len(legacy))
	for _, d := range legacy {
		ts, _ := strconv.ParseInt(d.ArticleInfo.Ctime, 10, 64)
		if ts == 0 {
			ts = host.NowUnix()
		}
		items = append(items, sdk.FeedItem{
			ID:          d.ArticleID,
			Title:       d.ArticleInfo.Title,
			URL:         "https://juejin.cn/post/" + d.ArticleID,
			Summary:     d.ArticleInfo.BriefContent,
			Cover:       d.ArticleInfo.CoverImage,
			Author:      d.AuthorUserInfo.Username,
			PublishedAt: time.Unix(ts, 0).Format(time.RFC3339),
		})
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("no items in feed")
	}
	return items, nil
}
