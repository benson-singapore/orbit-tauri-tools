package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

type PluginRow struct {
	ID           string
	ManifestJSON string
	Active       bool
	SortOrder    int
	InstalledAt  int64
	LastFetchAt  int64
	LastError    string
	Source       string
}

type FeedItemRow struct {
	ID          string
	PluginID    string
	Title       string
	Summary     string
	Cover       string
	MediaType   string
	SourceURL   string
	Author      string
	PublishedAt int64
	PayloadJSON string
}

func (s *Store) ListPlugins(ctx context.Context) ([]PluginRow, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, manifest_json, active, sort_order, installed_at,
		       COALESCE(last_fetch_at, 0), COALESCE(last_error, ''), source
		FROM plugins
		ORDER BY sort_order ASC, name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PluginRow
	for rows.Next() {
		var row PluginRow
		if err := rows.Scan(
			&row.ID, &row.ManifestJSON, &row.Active, &row.SortOrder,
			&row.InstalledAt, &row.LastFetchAt, &row.LastError, &row.Source,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Store) UpsertPluginRow(ctx context.Context, row PluginRow) error {
	active := 0
	if row.Active {
		active = 1
	}
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO plugins (
			id, name, manifest_json, active, sort_order, installed_at,
			last_fetch_at, last_error, source
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			manifest_json = excluded.manifest_json,
			active = excluded.active,
			sort_order = excluded.sort_order,
			last_fetch_at = excluded.last_fetch_at,
			last_error = excluded.last_error,
			source = excluded.source
	`, row.ID, pluginNameFromManifest(row.ManifestJSON), row.ManifestJSON, active,
		row.SortOrder, row.InstalledAt, row.LastFetchAt, row.LastError, row.Source)
	return err
}

func pluginNameFromManifest(raw string) string {
	var m struct {
		Name string `json:"name"`
	}
	_ = json.Unmarshal([]byte(raw), &m)
	if m.Name == "" {
		return "plugin"
	}
	return m.Name
}

func (s *Store) DeletePlugin(ctx context.Context, id string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM plugins WHERE id = ?`, id)
	return err
}

func (s *Store) ReplaceFeedItems(ctx context.Context, pluginID string, items []FeedItemRow, fetchedAt int64) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM feed_items WHERE plugin_id = ?`, pluginID); err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO feed_items (
			id, plugin_id, title, summary, cover, media_type, source_url,
			author, published_at, payload_json, fetched_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, item := range items {
		if _, err := stmt.ExecContext(ctx,
			item.ID, pluginID, item.Title, item.Summary, item.Cover, item.MediaType,
			item.SourceURL, item.Author, item.PublishedAt, item.PayloadJSON, fetchedAt,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) ListFeedItems(ctx context.Context, pluginID string) ([]FeedItemRow, error) {
	query := `
		SELECT id, plugin_id, title, summary, cover, media_type, source_url,
		       author, published_at, payload_json
		FROM feed_items
	`
	args := []any{}
	if pluginID != "" {
		query += ` WHERE plugin_id = ?`
		args = append(args, pluginID)
	}
	query += ` ORDER BY published_at DESC`

	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []FeedItemRow
	for rows.Next() {
		var item FeedItemRow
		if err := rows.Scan(
			&item.ID, &item.PluginID, &item.Title, &item.Summary, &item.Cover,
			&item.MediaType, &item.SourceURL, &item.Author, &item.PublishedAt, &item.PayloadJSON,
		); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) GetFeedItem(ctx context.Context, id string) (*FeedItemRow, error) {
	row := s.DB.QueryRowContext(ctx, `
		SELECT id, plugin_id, title, summary, cover, media_type, source_url,
		       author, published_at, payload_json
		FROM feed_items WHERE id = ?
	`, id)
	var item FeedItemRow
	if err := row.Scan(
		&item.ID, &item.PluginID, &item.Title, &item.Summary, &item.Cover,
		&item.MediaType, &item.SourceURL, &item.Author, &item.PublishedAt, &item.PayloadJSON,
	); err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Store) DeleteFeedItemsByPlugin(ctx context.Context, pluginID string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM feed_items WHERE plugin_id = ?`, pluginID)
	return err
}

func DecodeJSON(raw string, v any) error {
	return json.Unmarshal([]byte(raw), v)
}

func FormatRelativeTime(unix int64) string {
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
