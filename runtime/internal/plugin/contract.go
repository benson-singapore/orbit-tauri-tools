package plugin

import "time"

const (
	SourceRSS    = "rss"
	SourceWASM   = "wasm"
	SourceScript = "script"

	ExecutionWASM    = "wasm"
	ExecutionBrowser = "browser"
	ExecutionHybrid  = "hybrid"

	MediaArticle = "article"
	MediaManga   = "manga"
	MediaVideo   = "video"
	MediaAudio   = "audio"

	CapFeed    = "feed"
	CapSearch  = "search"
	CapDetail  = "detail"
	CapContent = "content"
)

// Manifest describes a plugin package (manifest.json).
type Manifest struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Version      string         `json:"version"`
	MediaType    string         `json:"mediaType"`
	Source       string         `json:"source"`
	Capabilities []string       `json:"capabilities"`
	Config       ManifestConfig `json:"config"`
	Meta         ManifestMeta   `json:"meta"`
	Bundled      bool           `json:"-"`
}

type ManifestConfig struct {
	Channels        []FeedChannel     `json:"channels"`
	DefaultChannel  string            `json:"defaultChannel,omitempty"`
	RefreshInterval int               `json:"refreshInterval"` // seconds, default 3600
	UserAgent       string            `json:"userAgent"`
	Secrets         map[string]string `json:"secrets,omitempty"`
	LegacyFeedURL   string            `json:"feedUrl,omitempty"` // migrated to channels on load; not persisted after save
	ExecutionMode   string            `json:"executionMode,omitempty"` // wasm | browser | hybrid (Phase 3)
	Wasm            WasmConfig        `json:"wasm,omitempty"`
	Browser         BrowserConfig     `json:"browser,omitempty"`
}

// WasmConfig describes the WASM binary for source=wasm plugins.
type WasmConfig struct {
	Entry       string `json:"entry"`                 // default plugin.wasm
	TimeoutMs   int    `json:"timeoutMs,omitempty"`   // default 30000
	MaxMemoryMB int    `json:"maxMemoryMB,omitempty"` // default 64
}

// BrowserConfig reserves Phase 3 browser/hybrid execution (not implemented yet).
type BrowserConfig struct {
	Required   bool     `json:"required,omitempty"`
	FallbackOn []string `json:"fallbackOn,omitempty"`
}

func DefaultWasmConfig() WasmConfig {
	return WasmConfig{
		Entry:       "plugin.wasm",
		TimeoutMs:   30000,
		MaxMemoryMB: 64,
	}
}

type ManifestMeta struct {
	Description    string `json:"description"`
	Icon           string `json:"icon"`
	Color          string `json:"color"`
	LogoText       string `json:"logoText"`
	LogoImageURL   string `json:"logoImageUrl"`
	IconURL        string `json:"iconUrl"`   // alias used by official packages
	IconColor      string `json:"iconColor"` // alias used by official packages
	MarketCategory string `json:"marketCategory"`
	CategoryTag    string `json:"categoryTag"`
	Official       bool   `json:"official"`
	MarketID       string `json:"marketId,omitempty"`
}

type InstallRSSOptions struct {
	ID              string
	Name            string
	Channels        []FeedChannel
	FeedURL         string // legacy: converted to single channel if Channels empty
	DefaultChannel  string
	MediaType       string
	RefreshInterval int
	UserAgent       string
	Icon            string
	Description     string
	Color           string
	LogoText        string
	LogoImageURL    string
	MarketCategory  string
	CategoryTag     string
}

// FeedQueryResult is the outcome of a feed list query.
type FeedQueryResult struct {
	Items    []FeedItem
	Total    int
	HasMore  bool
	PrePaged bool // true when Items are already limited to the requested page (dynamic WASM search)
}

// FeedItem is the normalized output shared with the frontend.
type FeedItem struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Summary     string   `json:"summary"`
	Content     string   `json:"content,omitempty"`
	Type        string   `json:"type"`
	PluginID    string   `json:"pluginId"`
	PluginName  string   `json:"pluginName"`
	Author      string   `json:"author"`
	PublishedAt int64    `json:"publishedAt"`
	Time        string   `json:"time"`
	Reads       string   `json:"reads"`
	Image       string   `json:"image,omitempty"`
	SourceURL   string   `json:"sourceUrl,omitempty"`
	ChannelID   string   `json:"channelId,omitempty"`
	Tags        []string `json:"tags"`
	ReadAt      int64    `json:"readAt,omitempty"`
	IsRead      bool     `json:"isRead"`
}

// PluginRecord merges manifest with runtime state from SQLite.
type PluginRecord struct {
	Manifest
	Active    bool   `json:"active"`
	SortOrder int    `json:"sortOrder"`
	Installed int64  `json:"installedAt"`
	LastFetch int64  `json:"lastFetchAt,omitempty"`
	LastError string `json:"lastError,omitempty"`
}

func DefaultRefreshInterval(sec int) time.Duration {
	if sec <= 0 {
		sec = 3600
	}
	return time.Duration(sec) * time.Second
}

func ContentTypeForMedia(mediaType string) string {
	switch mediaType {
	case MediaVideo:
		return "video"
	case MediaAudio:
		return "audio"
	case MediaManga:
		return "image"
	default:
		return "text"
	}
}

func MediaTypeFromIcon(icon string) string {
	switch icon {
	case "video":
		return MediaVideo
	case "audio":
		return MediaAudio
	case "image":
		return MediaManga
	default:
		return MediaArticle
	}
}

func HasCapability(m *Manifest, cap string) bool {
	for _, c := range m.Capabilities {
		if c == cap {
			return true
		}
	}
	return false
}
