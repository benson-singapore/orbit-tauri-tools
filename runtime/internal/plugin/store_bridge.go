package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

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

func feedItemToRow(item FeedItem, channelID string) (store.FeedItemRow, error) {
	payload, err := json.Marshal(map[string]any{
		"tags":       item.Tags,
		"pluginName": item.PluginName,
		"type":       item.Type,
		"channelId":  channelID,
		"content":    item.Content,
	})
	if err != nil {
		return store.FeedItemRow{}, err
	}
	return store.FeedItemRow{
		ID:          item.ID,
		PluginID:    item.PluginID,
		ChannelID:   channelID,
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

func rowToFeedItem(row store.FeedItemRow, includeContent bool) FeedItem {
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
		IsRead:      row.ReadAt.Valid,
	}
	if row.ReadAt.Valid {
		item.ReadAt = row.ReadAt.Int64
	}
	if row.PayloadJSON != "" {
		var payload struct {
			Tags       []string `json:"tags"`
			PluginName string   `json:"pluginName"`
			Type       string   `json:"type"`
			ChannelID  string   `json:"channelId"`
			Content    string   `json:"content"`
		}
		_ = json.Unmarshal([]byte(row.PayloadJSON), &payload)
		if payload.ChannelID != "" {
			item.ChannelID = payload.ChannelID
		} else if row.ChannelID != "" {
			item.ChannelID = row.ChannelID
		}
		if payload.PluginName != "" {
			item.PluginName = payload.PluginName
		}
		if len(payload.Tags) > 0 {
			item.Tags = payload.Tags
		}
		if payload.Type != "" {
			item.Type = payload.Type
		}
		if includeContent && payload.Content != "" {
			item.Content = payload.Content
		}
	}
	return item
}

func rowNeedsContentBackfill(row store.FeedItemRow) bool {
	if !articleRowExpectsContent(row) {
		return false
	}
	if row.PayloadJSON == "" {
		return true
	}
	var payload struct {
		Content string `json:"content"`
	}
	if err := json.Unmarshal([]byte(row.PayloadJSON), &payload); err != nil {
		return true
	}
	return strings.TrimSpace(payload.Content) == ""
}

func articleRowExpectsContent(row store.FeedItemRow) bool {
	if strings.TrimSpace(row.Title) == "" {
		return false
	}
	switch strings.TrimSpace(row.MediaType) {
	case "", "text":
		return true
	default:
		return false
	}
}

func rowsNeedContentBackfill(rows []store.FeedItemRow) bool {
	for _, row := range rows {
		if rowNeedsContentBackfill(row) {
			return true
		}
	}
	return false
}

func (r *Registry) preserveExistingArticleContent(ctx context.Context, items []FeedItem) {
	for i := range items {
		if strings.TrimSpace(items[i].Content) != "" {
			continue
		}
		existing, err := r.store.GetFeedItem(ctx, items[i].ID)
		if err != nil {
			continue
		}
		if strings.TrimSpace(existing.Summary) != "" && strings.TrimSpace(items[i].Summary) == "" {
			items[i].Summary = existing.Summary
		}
		if existing.PayloadJSON == "" {
			continue
		}
		var payload struct {
			Content string `json:"content"`
		}
		if err := json.Unmarshal([]byte(existing.PayloadJSON), &payload); err != nil {
			continue
		}
		if strings.TrimSpace(payload.Content) != "" {
			items[i].Content = payload.Content
		}
	}
}

func (r *Registry) persistFeedItemsForChannel(
	ctx context.Context,
	pluginID, channelID string,
	items []FeedItem,
	fetchedAt int64,
	itemLimit int,
) error {
	r.preserveExistingArticleContent(ctx, items)
	rows := make([]store.FeedItemRow, 0, len(items))
	for _, item := range items {
		row, err := feedItemToRow(item, channelID)
		if err != nil {
			return err
		}
		rows = append(rows, row)
	}
	if err := r.store.UpsertFeedItemsForChannel(ctx, pluginID, channelID, rows, fetchedAt); err != nil {
		return err
	}
	return r.store.TrimFeedItemsForChannel(ctx, pluginID, channelID, itemLimit)
}

func (r *Registry) loadFeedItems(ctx context.Context, pluginID, channelID, search string) ([]FeedItem, bool, error) {
	rows, err := r.store.ListFeedItems(ctx, pluginID, channelID, search)
	if err != nil {
		return nil, false, err
	}
	out := make([]FeedItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, rowToFeedItem(row, false))
	}
	return out, rowsNeedContentBackfill(rows), nil
}

func mergeFeedItemDetail(base, fetched FeedItem) FeedItem {
	out := base
	if strings.TrimSpace(fetched.Title) != "" {
		out.Title = fetched.Title
	}
	if strings.TrimSpace(fetched.Summary) != "" {
		out.Summary = fetched.Summary
	}
	if strings.TrimSpace(fetched.Content) != "" {
		out.Content = fetched.Content
	}
	if strings.TrimSpace(fetched.Image) != "" {
		out.Image = fetched.Image
	}
	if strings.TrimSpace(fetched.Author) != "" {
		out.Author = fetched.Author
	}
	if strings.TrimSpace(fetched.SourceURL) != "" {
		out.SourceURL = fetched.SourceURL
	}
	if len(fetched.Tags) > 0 {
		out.Tags = fetched.Tags
	}
	if fetched.PublishedAt > 0 {
		out.PublishedAt = fetched.PublishedAt
		out.Time = fetched.Time
	}
	return out
}

func (r *Registry) upsertFeedItem(ctx context.Context, item FeedItem, channelID string) error {
	if channelID == "" {
		channelID = item.ChannelID
	}
	row, err := feedItemToRow(item, channelID)
	if err != nil {
		return err
	}
	return r.store.UpsertFeedItemsForChannel(ctx, item.PluginID, channelID, []store.FeedItemRow{row}, time.Now().Unix())
}

func (r *Registry) GetFeedItem(ctx context.Context, id string) (*FeedItem, error) {
	row, err := r.store.GetFeedItem(ctx, id)
	if err != nil {
		return nil, err
	}
	item := rowToFeedItem(*row, true)
	rec, hasRec := r.Get(item.PluginID)
	if item.PluginName == "" && hasRec {
		item.PluginName = rec.Name
	}

	if !hasRec || !rec.Active {
		return &item, nil
	}

	detailCh, hasDetail := FindDetailDynamicChannel(rec.Config.Channels)
	if !hasDetail {
		return &item, nil
	}

	if !rowNeedsContentBackfill(*row) {
		return &item, nil
	}

	fetched, err := r.fetchDetailItem(ctx, rec, detailCh, item)
	if err != nil {
		log.Printf("[orbit-feed] detail fetch failed plugin=%q item_id=%q err=%v", rec.ID, id, err)
		return &item, nil
	}
	if fetched == nil {
		return &item, nil
	}

	merged := mergeFeedItemDetail(item, *fetched)
	channelID := merged.ChannelID
	if channelID == "" {
		channelID = row.ChannelID
	}
	if upsertErr := r.upsertFeedItem(ctx, merged, channelID); upsertErr != nil {
		log.Printf("[orbit-feed] detail persist failed plugin=%q item_id=%q err=%v", rec.ID, id, upsertErr)
	}
	return &merged, nil
}
