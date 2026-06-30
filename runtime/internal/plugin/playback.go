package plugin

import "strings"

const (
	PlaybackModeVideo   = "video"
	PlaybackModeAudio   = "audio"
	PlaybackModeArticle = "article"
	PlaybackModeManga   = "manga"

	ManagedByRuntime = "runtime"
	ManagedByPlugin  = "plugin"

	DefaultPlaybackLimit = 200
)

type PlaybackConfig struct {
	History   *bool  `json:"history,omitempty"`
	Progress  *bool  `json:"progress,omitempty"`
	Mode      string `json:"mode,omitempty"`
	Limit     *int   `json:"limit,omitempty"`
	ManagedBy string `json:"managedBy,omitempty"`
}

type PlaybackFeature struct {
	History  *bool  `json:"history,omitempty"`
	Progress *bool  `json:"progress,omitempty"`
	Mode     string `json:"mode,omitempty"`
	Limit    *int   `json:"limit,omitempty"`
}

type ResolvedPlayback struct {
	History   bool   `json:"history"`
	Progress  bool   `json:"progress"`
	Mode      string `json:"mode"`
	Limit     int    `json:"limit"`
	ManagedBy string `json:"managedBy"`
}

func DefaultPlaybackMode(mediaType string) string {
	switch strings.TrimSpace(mediaType) {
	case MediaVideo:
		return PlaybackModeVideo
	case MediaAudio:
		return PlaybackModeAudio
	case MediaManga:
		return PlaybackModeManga
	case MediaArticle, MediaNovel:
		return PlaybackModeArticle
	default:
		return PlaybackModeArticle
	}
}

func ResolvePlayback(m *Manifest, ch *FeedChannel) ResolvedPlayback {
	defaultMode := PlaybackModeArticle
	if m != nil {
		defaultMode = DefaultPlaybackMode(m.MediaType)
	}

	out := ResolvedPlayback{
		History:   false,
		Progress:  false,
		Mode:      defaultMode,
		Limit:     DefaultPlaybackLimit,
		ManagedBy: ManagedByRuntime,
	}

	// Plugins declaring the playback capability without explicit config still
	// participate in consumption history (see orbit-plugins playback.md).
	if m != nil && HasCapability(m, CapPlayback) && m.Config.Playback == nil {
		out.History = true
		out.Progress = true
	}

	if m != nil && m.Config.Playback != nil {
		cfg := m.Config.Playback
		out.History = boolVal(cfg.History, false)
		out.Progress = boolVal(cfg.Progress, false)
		if mode := strings.TrimSpace(cfg.Mode); mode != "" {
			out.Mode = mode
		}
		out.Limit = intVal(cfg.Limit, DefaultPlaybackLimit)
		if managedBy := strings.TrimSpace(cfg.ManagedBy); managedBy != "" {
			out.ManagedBy = managedBy
		}
	}

	if ch != nil && ch.Features.Playback != nil {
		f := ch.Features.Playback
		if f.History != nil {
			out.History = *f.History
		}
		if f.Progress != nil {
			out.Progress = *f.Progress
		}
		if mode := strings.TrimSpace(f.Mode); mode != "" {
			out.Mode = mode
		}
		if f.Limit != nil {
			out.Limit = intVal(f.Limit, DefaultPlaybackLimit)
		}
	}

	return out
}
