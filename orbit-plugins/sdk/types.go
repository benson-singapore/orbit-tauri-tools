package sdk

// FetchRequest is passed to Plugin.Fetch from the host runtime.
type FetchRequest struct {
	ChannelID string            `json:"channelId"`
	Route     string            `json:"route"`
	Params    map[string]string `json:"params"`
}

// FeedResult is the normalized feed payload returned to the host.
type FeedResult struct {
	Title       string     `json:"title"`
	Description string     `json:"description,omitempty"`
	Items       []FeedItem `json:"items"`
}

// FeedItem is one entry in a feed result.
type FeedItem struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	URL         string   `json:"url"`
	Content     string   `json:"content,omitempty"`
	Summary     string   `json:"summary,omitempty"`
	Author      string   `json:"author,omitempty"`
	Cover       string   `json:"cover,omitempty"`
	Image       string   `json:"image,omitempty"`
	PublishedAt string   `json:"published_at"`
	Tags        []string `json:"tags,omitempty"`
}
