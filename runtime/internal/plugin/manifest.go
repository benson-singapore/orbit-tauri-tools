package plugin

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var pluginIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{1,63}$`)

func LoadManifest(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	if err := ValidateManifest(&m); err != nil {
		return nil, err
	}
	return &m, nil
}

func ValidateManifest(m *Manifest) error {
	m.ID = strings.TrimSpace(m.ID)
	m.Name = strings.TrimSpace(m.Name)
	if m.ID == "" {
		return fmt.Errorf("manifest.id is required")
	}
	if !pluginIDPattern.MatchString(m.ID) {
		return fmt.Errorf("manifest.id %q is invalid", m.ID)
	}
	if m.Name == "" {
		return fmt.Errorf("manifest.name is required")
	}
	if m.Version == "" {
		m.Version = "1.0.0"
	}
	if m.MediaType == "" {
		m.MediaType = MediaArticle
	}
	switch m.MediaType {
	case MediaArticle, MediaManga, MediaVideo, MediaAudio:
	default:
		return fmt.Errorf("unsupported manifest.mediaType %q", m.MediaType)
	}
	if m.Source == "" {
		return fmt.Errorf("manifest.source is required")
	}
	if len(m.Capabilities) == 0 {
		return fmt.Errorf("manifest.capabilities is required")
	}

	switch m.Source {
	case SourceRSS:
		if !HasCapability(m, CapFeed) {
			return fmt.Errorf("rss plugin must declare capability %q", CapFeed)
		}
		m.Config.FeedURL = strings.TrimSpace(m.Config.FeedURL)
		if m.Config.FeedURL == "" {
			return fmt.Errorf("rss plugin requires config.feedUrl")
		}
	case SourceScript:
		return fmt.Errorf("script plugins are not supported yet")
	default:
		return fmt.Errorf("unsupported manifest.source %q", m.Source)
	}
	return nil
}

func SaveManifest(dir string, m *Manifest) error {
	if err := ValidateManifest(m); err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("mkdir plugin dir: %w", err)
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal manifest: %w", err)
	}
	path := filepath.Join(dir, "manifest.json")
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("write manifest: %w", err)
	}
	return nil
}

// NewRSSManifest builds a manifest for a user-imported feed.
func NewRSSManifest(id, name, feedURL string) *Manifest {
	if name == "" {
		name = "Custom RSS"
	}
	return &Manifest{
		ID:           id,
		Name:         name,
		Version:      "1.0.0",
		MediaType:    MediaArticle,
		Source:       SourceRSS,
		Capabilities: []string{CapFeed},
		Config: ManifestConfig{
			FeedURL:         feedURL,
			RefreshInterval: 3600,
		},
		Meta: ManifestMeta{
			Description:    feedURL,
			Icon:           "text",
			Color:          "bg-orange-500",
			LogoText:       "R",
			LogoImageURL:   "",
			MarketCategory: "blog",
			CategoryTag:    "RSS",
			Official:       false,
		},
	}
}
