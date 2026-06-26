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
	return ParseManifestBytes(data)
}

// ParseManifestBytes unmarshals and normalizes manifest JSON from disk or packages.
func ParseManifestBytes(data []byte) (*Manifest, error) {
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	NormalizeManifestMeta(&m)
	MigrateManifestConfig(&m.Config)
	if err := ValidateManifest(&m); err != nil {
		return nil, err
	}
	return &m, nil
}

// NormalizeManifestMeta maps legacy field aliases from official plugin packages.
func NormalizeManifestMeta(m *Manifest) {
	if strings.TrimSpace(m.Meta.LogoImageURL) == "" && strings.TrimSpace(m.Meta.IconURL) != "" {
		m.Meta.LogoImageURL = strings.TrimSpace(m.Meta.IconURL)
	}
	if strings.TrimSpace(m.Meta.IconURL) == "" && strings.TrimSpace(m.Meta.LogoImageURL) != "" {
		m.Meta.IconURL = strings.TrimSpace(m.Meta.LogoImageURL)
	}
	if strings.TrimSpace(m.Meta.Color) == "" && strings.TrimSpace(m.Meta.IconColor) != "" {
		m.Meta.Color = strings.TrimSpace(m.Meta.IconColor)
	}
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
	case MediaArticle, MediaManga, MediaImage, MediaVideo, MediaAudio, MediaRating, MediaSocial:
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
		MigrateManifestConfig(&m.Config)
		if err := validateRSSChannels(m.Config.Channels); err != nil {
			return err
		}
		if err := validateDefaultChannel(m); err != nil {
			return err
		}
	case SourceWASM:
		if !HasCapability(m, CapFeed) {
			return fmt.Errorf("wasm plugin must declare capability %q", CapFeed)
		}
		MigrateManifestConfig(&m.Config)
		normalizeChannels(&m.Config, m.MediaType)
		if err := validateWasmChannels(m.Config.Channels); err != nil {
			return err
		}
		if err := validateDefaultChannel(m); err != nil {
			return err
		}
		normalizeWasmConfig(&m.Config)
		if m.Config.ExecutionMode == "" {
			m.Config.ExecutionMode = ExecutionWASM
		}
		switch m.Config.ExecutionMode {
		case ExecutionWASM, ExecutionBrowser, ExecutionHybrid:
		default:
			return fmt.Errorf("unsupported executionMode %q", m.Config.ExecutionMode)
		}
	case SourceScript:
		return fmt.Errorf("script plugins are not supported yet")
	default:
		return fmt.Errorf("unsupported manifest.source %q", m.Source)
	}
	return nil
}

func validateDefaultChannel(m *Manifest) error {
	if dc := strings.TrimSpace(m.Config.DefaultChannel); dc != "" {
		if _, ok := findChannel(m.Config.Channels, dc); !ok {
			return fmt.Errorf("defaultChannel %q not found in channels", dc)
		}
		m.Config.DefaultChannel = dc
	}
	return nil
}

func normalizeWasmConfig(cfg *ManifestConfig) {
	w := cfg.Wasm
	if strings.TrimSpace(w.Entry) == "" {
		w.Entry = DefaultWasmConfig().Entry
	}
	if w.TimeoutMs <= 0 {
		w.TimeoutMs = DefaultWasmConfig().TimeoutMs
	}
	if w.MaxMemoryMB <= 0 {
		w.MaxMemoryMB = DefaultWasmConfig().MaxMemoryMB
	}
	cfg.Wasm = w
}

// ValidateManifestOnDisk checks manifest and required wasm binary under pluginDir.
func ValidateManifestOnDisk(pluginDir string, m *Manifest) error {
	if err := ValidateManifest(m); err != nil {
		return err
	}
	if m.Source != SourceWASM {
		return nil
	}
	entry := strings.TrimSpace(m.Config.Wasm.Entry)
	if entry == "" {
		entry = DefaultWasmConfig().Entry
	}
	wasmPath := filepath.Join(pluginDir, entry)
	if _, err := os.Stat(wasmPath); err != nil {
		return fmt.Errorf("wasm entry %q not found in plugin dir: %w", entry, err)
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
	persisted := manifestForPersistence(*m)
	data, err := json.MarshalIndent(persisted, "", "  ")
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
func NewRSSManifest(id, name string, channels []FeedChannel) *Manifest {
	if name == "" {
		name = "Custom RSS"
	}
	desc := name
	if len(channels) == 1 {
		desc = channels[0].FeedURL
	}
	return &Manifest{
		ID:           id,
		Name:         name,
		Version:      "1.0.0",
		MediaType:    MediaArticle,
		Source:       SourceRSS,
		Capabilities: []string{CapFeed},
		Config: ManifestConfig{
			Channels:        channels,
			RefreshInterval: 3600,
		},
		Meta: ManifestMeta{
			Description:    desc,
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
