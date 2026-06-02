package plugin

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/orbit-tauri-tools/runtime/internal/store"
)

func (r *Registry) upsertPlugin(ctx context.Context, rec *PluginRecord) error {
	manifestJSON, err := json.Marshal(rec.Manifest)
	if err != nil {
		return fmt.Errorf("marshal manifest: %w", err)
	}
	return r.store.UpsertPluginRow(ctx, storePluginRow(rec, string(manifestJSON)))
}

func storePluginRow(rec *PluginRecord, manifestJSON string) store.PluginRow {
	return store.PluginRow{
		ID:           rec.ID,
		ManifestJSON: manifestJSON,
		Active:       rec.Active,
		SortOrder:    rec.SortOrder,
		InstalledAt:  rec.Installed,
		LastFetchAt:  rec.LastFetch,
		LastError:    rec.LastError,
		Source:       rec.Source,
	}
}

func feedItemToRow(item FeedItem) (store.FeedItemRow, error) {
	payload, err := json.Marshal(map[string]any{
		"tags":       item.Tags,
		"pluginName": item.PluginName,
		"type":       item.Type,
	})
	if err != nil {
		return store.FeedItemRow{}, err
	}
	return store.FeedItemRow{
		ID:          item.ID,
		PluginID:    item.PluginID,
		Title:       item.Title,
		Summary:     item.Summary,
		Cover:       item.Image,
		MediaType:   item.Type,
		SourceURL:   item.SourceURL,
		Author:      item.Author,
		PublishedAt: item.PublishedAt,
		PayloadJSON: string(payload),
	}, nil
}

func rowToFeedItem(row store.FeedItemRow) FeedItem {
	item := FeedItem{
		ID:          row.ID,
		PluginID:    row.PluginID,
		Title:       row.Title,
		Summary:     row.Summary,
		Image:       row.Cover,
		Type:        row.MediaType,
		SourceURL:   row.SourceURL,
		Author:      row.Author,
		PublishedAt: row.PublishedAt,
		Time:        store.FormatRelativeTime(row.PublishedAt),
	}
	if row.PayloadJSON != "" {
		var payload struct {
			Tags       []string `json:"tags"`
			PluginName string   `json:"pluginName"`
			Type       string   `json:"type"`
		}
		_ = json.Unmarshal([]byte(row.PayloadJSON), &payload)
		if payload.PluginName != "" {
			item.PluginName = payload.PluginName
		}
		if len(payload.Tags) > 0 {
			item.Tags = payload.Tags
		}
		if payload.Type != "" {
			item.Type = payload.Type
		}
	}
	return item
}

func (r *Registry) persistFeedItems(ctx context.Context, pluginID string, items []FeedItem, fetchedAt int64) error {
	rows := make([]store.FeedItemRow, 0, len(items))
	for _, item := range items {
		row, err := feedItemToRow(item)
		if err != nil {
			return err
		}
		rows = append(rows, row)
	}
	return r.store.ReplaceFeedItems(ctx, pluginID, rows, fetchedAt)
}

func (r *Registry) loadFeedItems(ctx context.Context, pluginID string) ([]FeedItem, error) {
	rows, err := r.store.ListFeedItems(ctx, pluginID)
	if err != nil {
		return nil, err
	}
	out := make([]FeedItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, rowToFeedItem(row))
	}
	return out, nil
}
