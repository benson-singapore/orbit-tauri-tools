package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
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
	ChannelID   string
	Title       string
	Summary     string
	Cover       string
	MediaType   string
	SourceURL   string
	Author      string
	PublishedAt int64
	PayloadJSON string
	ReadAt      sql.NullInt64
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

func (s *Store) UpsertFeedItemsForChannel(
	ctx context.Context,
	pluginID, channelID string,
	items []FeedItemRow,
	fetchedAt int64,
) error {
	if len(items) == 0 {
		return nil
	}

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO feed_items (
			id, plugin_id, channel_id, title, summary, cover, media_type, source_url,
			author, published_at, payload_json, fetched_at, read_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			summary = excluded.summary,
			cover = excluded.cover,
			media_type = excluded.media_type,
			source_url = excluded.source_url,
			author = excluded.author,
			published_at = excluded.published_at,
			payload_json = excluded.payload_json,
			fetched_at = excluded.fetched_at,
			read_at = COALESCE(feed_items.read_at, excluded.read_at)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, item := range items {
		chID := item.ChannelID
		if chID == "" {
			chID = channelID
		}
		if _, err := stmt.ExecContext(ctx,
			item.ID, pluginID, chID, item.Title, item.Summary, item.Cover, item.MediaType,
			item.SourceURL, item.Author, item.PublishedAt, item.PayloadJSON, fetchedAt, nil,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) TrimFeedItemsForChannel(
	ctx context.Context,
	pluginID, channelID string,
	limit int,
) error {
	if limit <= 0 {
		return nil
	}
	var count int
	if err := s.DB.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM feed_items WHERE plugin_id = ? AND channel_id = ?`,
		pluginID, channelID,
	).Scan(&count); err != nil {
		return err
	}
	if count <= limit {
		return nil
	}
	excess := count - limit
	_, err := s.DB.ExecContext(ctx, `
		DELETE FROM feed_items WHERE id IN (
			SELECT id FROM feed_items
			WHERE plugin_id = ? AND channel_id = ?
			ORDER BY published_at ASC, id ASC
			LIMIT ?
		)
	`, pluginID, channelID, excess)
	return err
}

func (s *Store) ReplaceFeedItemsForChannel(
	ctx context.Context,
	pluginID, channelID string,
	items []FeedItemRow,
	fetchedAt int64,
) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	readAtByID := make(map[string]int64)
	readRows, err := tx.QueryContext(ctx,
		`SELECT id, read_at FROM feed_items
		 WHERE plugin_id = ? AND channel_id = ? AND read_at IS NOT NULL`,
		pluginID, channelID,
	)
	if err != nil {
		return err
	}
	for readRows.Next() {
		var id string
		var readAt int64
		if err := readRows.Scan(&id, &readAt); err != nil {
			readRows.Close()
			return err
		}
		readAtByID[id] = readAt
	}
	if err := readRows.Close(); err != nil {
		return err
	}
	if err := readRows.Err(); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM feed_items WHERE plugin_id = ? AND channel_id = ?`,
		pluginID, channelID,
	); err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO feed_items (
			id, plugin_id, channel_id, title, summary, cover, media_type, source_url,
			author, published_at, payload_json, fetched_at, read_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, item := range items {
		chID := item.ChannelID
		if chID == "" {
			chID = channelID
		}
		var readAt any
		if ts, ok := readAtByID[item.ID]; ok {
			readAt = ts
		}
		if _, err := stmt.ExecContext(ctx,
			item.ID, pluginID, chID, item.Title, item.Summary, item.Cover, item.MediaType,
			item.SourceURL, item.Author, item.PublishedAt, item.PayloadJSON, fetchedAt, readAt,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) ListFeedItems(ctx context.Context, pluginID, channelID, search string) ([]FeedItemRow, error) {
	query := `
		SELECT id, plugin_id, channel_id, title, summary, cover, media_type, source_url,
		       author, published_at, payload_json, read_at
		FROM feed_items
	`
	args := []any{}
	where := make([]string, 0, 3)
	if pluginID != "" {
		where = append(where, `plugin_id = ?`)
		args = append(args, pluginID)
	}
	if channelID != "" {
		where = append(where, `channel_id = ?`)
		args = append(args, channelID)
	}
	search = strings.TrimSpace(search)
	if search != "" {
		pattern := "%" + sanitizeLikePattern(search) + "%"
		where = append(where, `(LOWER(title) LIKE LOWER(?) OR LOWER(summary) LIKE LOWER(?) OR LOWER(author) LIKE LOWER(?) OR LOWER(payload_json) LIKE LOWER(?))`)
		args = append(args, pattern, pattern, pattern, pattern)
	}
	if len(where) > 0 {
		query += ` WHERE ` + strings.Join(where, ` AND `)
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
			&item.ID, &item.PluginID, &item.ChannelID, &item.Title, &item.Summary, &item.Cover,
			&item.MediaType, &item.SourceURL, &item.Author, &item.PublishedAt, &item.PayloadJSON,
			&item.ReadAt,
		); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) GetFeedItem(ctx context.Context, id string) (*FeedItemRow, error) {
	row := s.DB.QueryRowContext(ctx, `
		SELECT id, plugin_id, channel_id, title, summary, cover, media_type, source_url,
		       author, published_at, payload_json, read_at
		FROM feed_items WHERE id = ?
	`, id)
	var item FeedItemRow
	if err := row.Scan(
		&item.ID, &item.PluginID, &item.ChannelID, &item.Title, &item.Summary, &item.Cover,
		&item.MediaType, &item.SourceURL, &item.Author, &item.PublishedAt, &item.PayloadJSON,
		&item.ReadAt,
	); err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Store) MarkFeedItemRead(ctx context.Context, id string, readAt int64) error {
	if readAt <= 0 {
		readAt = time.Now().Unix()
	}
	res, err := s.DB.ExecContext(ctx,
		`UPDATE feed_items SET read_at = ? WHERE id = ? AND read_at IS NULL`,
		readAt, id,
	)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		var exists int
		err := s.DB.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM feed_items WHERE id = ?`, id,
		).Scan(&exists)
		if err != nil {
			return err
		}
		if exists == 0 {
			return fmt.Errorf("feed item not found: %s", id)
		}
	}
	return nil
}

func (s *Store) CountUnreadFeedItemsForPlugins(
	ctx context.Context,
	pluginIDs []string,
	channelID, contentType string,
) (int, error) {
	if len(pluginIDs) == 0 {
		return 0, nil
	}
	placeholders := make([]string, len(pluginIDs))
	args := make([]any, 0, len(pluginIDs)+2)
	for i, id := range pluginIDs {
		placeholders[i] = "?"
		args = append(args, id)
	}
	query := `SELECT COUNT(*) FROM feed_items WHERE read_at IS NULL AND plugin_id IN (` +
		strings.Join(placeholders, ",") + `)`
	where := make([]string, 0, 2)
	if channelID != "" {
		where = append(where, `channel_id = ?`)
		args = append(args, channelID)
	}
	if contentType != "" {
		where = append(where, `media_type = ?`)
		args = append(args, contentType)
	}
	if len(where) > 0 {
		query += ` AND ` + strings.Join(where, ` AND `)
	}
	var count int
	if err := s.DB.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (s *Store) CountUnreadFeedItems(
	ctx context.Context,
	pluginID, channelID, contentType string,
) (int, error) {
	query := `SELECT COUNT(*) FROM feed_items WHERE read_at IS NULL`
	args := []any{}
	where := make([]string, 0, 3)
	if pluginID != "" {
		where = append(where, `plugin_id = ?`)
		args = append(args, pluginID)
	}
	if channelID != "" {
		where = append(where, `channel_id = ?`)
		args = append(args, channelID)
	}
	if contentType != "" {
		where = append(where, `media_type = ?`)
		args = append(args, contentType)
	}
	if len(where) > 0 {
		query += ` AND ` + strings.Join(where, ` AND `)
	}
	var count int
	if err := s.DB.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (s *Store) DeleteFeedItemsByPlugin(ctx context.Context, pluginID string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM feed_items WHERE plugin_id = ?`, pluginID)
	return err
}

func DecodeJSON(raw string, v any) error {
	return json.Unmarshal([]byte(raw), v)
}

func sanitizeLikePattern(raw string) string {
	raw = strings.ReplaceAll(raw, `%`, "")
	raw = strings.ReplaceAll(raw, `_`, "")
	return raw
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
