package plugin

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mmcdole/gofeed"
)

const (
	defaultUserAgent = "OrbitReader/0.1 (+https://github.com/orbit-tauri-tools)"
	maxSummaryRunes  = 500
)

type RSSFetcher struct {
	client *http.Client
	parser *gofeed.Parser
}

func NewRSSFetcher() *RSSFetcher {
	return &RSSFetcher{
		client: &http.Client{Timeout: 30 * time.Second},
		parser: gofeed.NewParser(),
	}
}

func (f *RSSFetcher) FetchFeedURL(ctx context.Context, m *Manifest, feedURL string) ([]FeedItem, error) {
	if m.Source != SourceRSS {
		return nil, fmt.Errorf("plugin %s is not rss", m.ID)
	}
	feedURL = strings.TrimSpace(feedURL)
	if feedURL == "" {
		return nil, fmt.Errorf("feedUrl is required")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return nil, err
	}
	ua := strings.TrimSpace(m.Config.UserAgent)
	if ua == "" {
		ua = defaultUserAgent
	}
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml, */*")

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch feed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("feed HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	feed, err := f.parser.Parse(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("parse feed: %w", err)
	}

	contentType := ContentTypeForMedia(m.MediaType)
	items := make([]FeedItem, 0, len(feed.Items))
	for _, item := range feed.Items {
		fi := f.mapItem(m, contentType, item)
		if fi.Title == "" {
			continue
		}
		items = append(items, fi)
	}
	return items, nil
}

func (f *RSSFetcher) mapItem(m *Manifest, contentType string, item *gofeed.Item) FeedItem {
	title := strings.TrimSpace(item.Title)
	link := strings.TrimSpace(item.Link)
	guid := strings.TrimSpace(item.GUID)
	if guid == "" {
		guid = link
	}
	if guid == "" {
		guid = title
	}

	published := item.PublishedParsed
	if published == nil {
		published = item.UpdatedParsed
	}
	var publishedAt int64
	if published != nil {
		publishedAt = published.Unix()
	}

	htmlContent := extractHTMLContent(item)
	summary := truncateRunes(plainText(htmlContent), maxSummaryRunes)

	author := ""
	if item.Author != nil {
		author = strings.TrimSpace(item.Author.Name)
	}
	if author == "" && len(item.Authors) > 0 {
		author = strings.TrimSpace(item.Authors[0].Name)
	}
	if author == "" {
		author = m.Name
	}

	image := extractImage(item)
	tags := make([]string, 0, len(item.Categories))
	for _, c := range item.Categories {
		c = strings.TrimSpace(c)
		if c != "" {
			tags = append(tags, c)
		}
	}

	htmlContent = stripLeadingDuplicateCoverImage(image, htmlContent)

	return FeedItem{
		ID:          FeedItemID(m.ID, guid),
		Title:       title,
		Summary:     summary,
		Content:     htmlContent,
		Type:        contentType,
		PluginID:    m.ID,
		PluginName:  m.Name,
		Author:      author,
		PublishedAt: publishedAt,
		Time:        formatRelativeTime(publishedAt),
		Image:       image,
		SourceURL:   link,
		Tags:        tags,
	}
}

func FeedItemID(pluginID, guid string) string {
	sum := sha256.Sum256([]byte(pluginID + "\n" + guid))
	return pluginID + ":" + hex.EncodeToString(sum[:8])
}

func extractImage(item *gofeed.Item) string {
	if item.Image != nil && item.Image.URL != "" {
		return item.Image.URL
	}
	if item.Enclosures != nil {
		for _, enc := range item.Enclosures {
			if strings.HasPrefix(enc.Type, "image/") && enc.URL != "" {
				return enc.URL
			}
		}
	}
	// Some feeds embed image in content HTML — keep MVP simple, skip parsing.
	return ""
}

func extractHTMLContent(item *gofeed.Item) string {
	for _, raw := range []string{item.Content, item.Description} {
		s := strings.TrimSpace(raw)
		if s != "" {
			return s
		}
	}
	return ""
}

func plainText(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if strings.Contains(s, "<") {
		s = stripTags(s)
	}
	s = strings.Join(strings.Fields(s), " ")
	return strings.TrimSpace(s)
}

func stripTags(html string) string {
	var b strings.Builder
	inTag := false
	for _, r := range html {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func truncateRunes(s string, max int) string {
	if max <= 0 || s == "" {
		return s
	}
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max]) + "…"
}

func formatRelativeTime(unix int64) string {
	if unix <= 0 {
		return "刚刚"
	}
	diff := time.Since(time.Unix(unix, 0))
	switch {
	case diff < time.Minute:
		return "刚刚"
	case diff < time.Hour:
		return fmt.Sprintf("%d 分钟前", int(diff.Minutes()))
	case diff < 24*time.Hour:
		return fmt.Sprintf("%d 小时前", int(diff.Hours()))
	case diff < 7*24*time.Hour:
		return fmt.Sprintf("%d 天前", int(diff.Hours()/24))
	default:
		return time.Unix(unix, 0).Format("2006-01-02")
	}
}

var (
	firstImgSrcRE         = regexp.MustCompile(`(?i)<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']`)
	leadingParagraphImgRE = regexp.MustCompile(`(?is)^\s*<p\b[^>]*>\s*<img\b[^>]*>\s*</p>\s*`)
	leadingImgRE          = regexp.MustCompile(`(?is)^\s*<img\b[^>]*>\s*`)
)

func normalizeImageURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if parsed, err := url.Parse(raw); err == nil && parsed.Host != "" {
		path := parsed.Path
		if i := strings.Index(path, "~"); i > 0 {
			path = path[:i]
		}
		return strings.ToLower(parsed.Host + path)
	}
	if i := strings.IndexAny(raw, "?#"); i >= 0 {
		raw = raw[:i]
	}
	if i := strings.Index(raw, "~"); i > 0 {
		raw = raw[:i]
	}
	return strings.ToLower(raw)
}

func imagesSameAsset(a, b string) bool {
	left := normalizeImageURL(a)
	right := normalizeImageURL(b)
	if left == "" || right == "" {
		return false
	}
	if left == right {
		return true
	}
	leftName := left[strings.LastIndex(left, "/")+1:]
	rightName := right[strings.LastIndex(right, "/")+1:]
	return len(leftName) > 8 && leftName == rightName
}

func stripLeadingDuplicateCoverImage(cover, html string) string {
	cover = strings.TrimSpace(cover)
	html = strings.TrimSpace(html)
	if cover == "" || html == "" {
		return html
	}
	match := firstImgSrcRE.FindStringSubmatch(html)
	if len(match) < 2 || !imagesSameAsset(cover, match[1]) {
		return html
	}
	if leadingParagraphImgRE.MatchString(html) {
		return leadingParagraphImgRE.ReplaceAllString(html, "")
	}
	return leadingImgRE.ReplaceAllString(html, "")
}
