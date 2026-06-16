package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

type ChapterItemRow struct {
	ID          string
	PluginID    string
	ChannelID   string
	ParentID    string
	Title       string
	Summary     string
	Cover       string
	PayloadJSON string
	FetchedAt   int64
	SortOrder   int
}

func (s *Store) GetPluginVariable(ctx context.Context, pluginID, key string) (string, bool, error) {
	var value string
	err := s.DB.QueryRowContext(ctx,
		`SELECT value FROM plugin_variables WHERE plugin_id = ? AND key = ?`,
		pluginID, key,
	).Scan(&value)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return value, true, nil
}

func (s *Store) ListPluginVariables(ctx context.Context, pluginID string) (map[string]string, error) {
	rows, err := s.DB.QueryContext(ctx,
		`SELECT key, value FROM plugin_variables WHERE plugin_id = ?`,
		pluginID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		out[key] = value
	}
	return out, rows.Err()
}

func (s *Store) UpsertPluginVariables(ctx context.Context, pluginID string, values map[string]string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO plugin_variables (plugin_id, key, value)
		VALUES (?, ?, ?)
		ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for key, value := range values {
		if _, err := stmt.ExecContext(ctx, pluginID, key, value); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) DeletePluginVariables(ctx context.Context, pluginID string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM plugin_variables WHERE plugin_id = ?`, pluginID)
	return err
}

func (s *Store) FeedItemExists(ctx context.Context, id string) (bool, error) {
	var count int
	err := s.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM feed_items WHERE id = ?`, id).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Store) InsertFeedItemsIgnore(
	ctx context.Context,
	pluginID, channelID string,
	items []FeedItemRow,
	fetchedAt int64,
) (int, error) {
	if len(items) == 0 {
		return 0, nil
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT OR IGNORE INTO feed_items (
			id, plugin_id, channel_id, title, summary, cover, media_type, source_url,
			author, published_at, payload_json, fetched_at, read_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	inserted := 0
	for _, item := range items {
		chID := item.ChannelID
		if chID == "" {
			chID = channelID
		}
		res, err := stmt.ExecContext(ctx,
			item.ID, pluginID, chID, item.Title, item.Summary, item.Cover, item.MediaType,
			item.SourceURL, item.Author, item.PublishedAt, item.PayloadJSON, fetchedAt, nil,
		)
		if err != nil {
			return inserted, err
		}
		n, _ := res.RowsAffected()
		inserted += int(n)
	}
	if err := tx.Commit(); err != nil {
		return inserted, err
	}
	return inserted, nil
}

func (s *Store) UpdateFeedItemPayload(ctx context.Context, id string, payloadJSON string, fetchedAt int64) error {
	_, err := s.DB.ExecContext(ctx, `
		UPDATE feed_items SET payload_json = ?, fetched_at = ? WHERE id = ?
	`, payloadJSON, fetchedAt, id)
	return err
}

func (s *Store) ListFeedItemsPaged(
	ctx context.Context,
	pluginID, channelID string,
	limit, offset int,
) ([]FeedItemRow, int, error) {
	var total int
	if err := s.DB.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM feed_items WHERE plugin_id = ? AND channel_id = ?`,
		pluginID, channelID,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, plugin_id, channel_id, title, summary, cover, media_type, source_url,
		       author, published_at, payload_json, read_at
		FROM feed_items
		WHERE plugin_id = ? AND channel_id = ?
		ORDER BY published_at DESC, id DESC
		LIMIT ? OFFSET ?
	`, pluginID, channelID, limit, offset)
	if err != nil {
		return nil, 0, err
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
			return nil, 0, err
		}
		out = append(out, item)
	}
	return out, total, rows.Err()
}

func (s *Store) UpsertChapterItems(
	ctx context.Context,
	pluginID, channelID, parentID string,
	items []ChapterItemRow,
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
		INSERT INTO chapter_items (
			id, plugin_id, channel_id, parent_id, title, summary, cover, payload_json, fetched_at, sort_order
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			summary = excluded.summary,
			cover = excluded.cover,
			payload_json = excluded.payload_json,
			fetched_at = excluded.fetched_at
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, item := range items {
		if _, err := stmt.ExecContext(ctx,
			item.ID, pluginID, channelID, parentID,
			item.Title, item.Summary, item.Cover, item.PayloadJSON, fetchedAt, item.SortOrder,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) InsertChapterItemsIgnore(
	ctx context.Context,
	pluginID, channelID, parentID string,
	items []ChapterItemRow,
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
		INSERT OR IGNORE INTO chapter_items (
			id, plugin_id, channel_id, parent_id, title, summary, cover, payload_json, fetched_at, sort_order
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, item := range items {
		if _, err := stmt.ExecContext(ctx,
			item.ID, pluginID, channelID, parentID,
			item.Title, item.Summary, item.Cover, item.PayloadJSON, fetchedAt, item.SortOrder,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ListChapterItems(
	ctx context.Context,
	pluginID, channelID, parentID string,
) ([]ChapterItemRow, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, plugin_id, channel_id, parent_id, title, summary, cover, payload_json, fetched_at, sort_order
		FROM chapter_items
		WHERE plugin_id = ? AND channel_id = ? AND parent_id = ?
		ORDER BY sort_order ASC, id ASC
	`, pluginID, channelID, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChapterItemRow
	for rows.Next() {
		var item ChapterItemRow
		if err := rows.Scan(
			&item.ID, &item.PluginID, &item.ChannelID, &item.ParentID,
			&item.Title, &item.Summary, &item.Cover, &item.PayloadJSON, &item.FetchedAt, &item.SortOrder,
		); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) GetChapterItem(ctx context.Context, id string) (*ChapterItemRow, error) {
	row := s.DB.QueryRowContext(ctx, `
		SELECT id, plugin_id, channel_id, parent_id, title, summary, cover, payload_json, fetched_at, sort_order
		FROM chapter_items WHERE id = ?
	`, id)
	var item ChapterItemRow
	if err := row.Scan(
		&item.ID, &item.PluginID, &item.ChannelID, &item.ParentID,
		&item.Title, &item.Summary, &item.Cover, &item.PayloadJSON, &item.FetchedAt, &item.SortOrder,
	); err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Store) TrimChapterItemsForParent(
	ctx context.Context,
	pluginID, channelID, parentID string,
	limit int,
) error {
	if limit <= 0 {
		return nil
	}
	var count int
	if err := s.DB.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM chapter_items WHERE plugin_id = ? AND channel_id = ? AND parent_id = ?`,
		pluginID, channelID, parentID,
	).Scan(&count); err != nil {
		return err
	}
	if count <= limit {
		return nil
	}
	excess := count - limit
	_, err := s.DB.ExecContext(ctx, `
		DELETE FROM chapter_items WHERE id IN (
			SELECT id FROM chapter_items
			WHERE plugin_id = ? AND channel_id = ? AND parent_id = ?
			ORDER BY sort_order DESC, id DESC
			LIMIT ?
		)
	`, pluginID, channelID, parentID, excess)
	return err
}

func (s *Store) CountChapterItemsForParent(
	ctx context.Context,
	pluginID, channelID, parentID string,
) (int, error) {
	var count int
	err := s.DB.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM chapter_items WHERE plugin_id = ? AND channel_id = ? AND parent_id = ?`,
		pluginID, channelID, parentID,
	).Scan(&count)
	return count, err
}

func (s *Store) DeleteChapterItemsByParent(
	ctx context.Context,
	pluginID, channelID, parentID string,
) error {
	_, err := s.DB.ExecContext(ctx,
		`DELETE FROM chapter_items WHERE plugin_id = ? AND channel_id = ? AND parent_id = ?`,
		pluginID, channelID, parentID,
	)
	return err
}

func (s *Store) MaxChapterItemSortOrder(
	ctx context.Context,
	pluginID, channelID, parentID string,
) (int, error) {
	var max sql.NullInt64
	err := s.DB.QueryRowContext(ctx, `
		SELECT MAX(sort_order) FROM chapter_items
		WHERE plugin_id = ? AND channel_id = ? AND parent_id = ?
	`, pluginID, channelID, parentID).Scan(&max)
	if err != nil {
		return -1, err
	}
	if !max.Valid {
		return -1, nil
	}
	return int(max.Int64), nil
}

func (s *Store) DeleteChapterItemsByPlugin(ctx context.Context, pluginID string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM chapter_items WHERE plugin_id = ?`, pluginID)
	return err
}

func (s *Store) DeleteFeedItemsByChannel(ctx context.Context, pluginID, channelID string) error {
	_, err := s.DB.ExecContext(ctx,
		`DELETE FROM feed_items WHERE plugin_id = ? AND channel_id = ?`,
		pluginID, channelID,
	)
	return err
}

func MaskSecretValue(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if len(value) <= 4 {
		return "****"
	}
	return value[:2] + strings.Repeat("*", len(value)-4) + value[len(value)-2:]
}

func ValidateRequiredVariables(
	defs map[string]struct {
		Label    string `json:"label"`
		Required bool   `json:"required"`
		Default  string `json:"default"`
	},
	values map[string]string,
) error {
	for key, def := range defs {
		val := strings.TrimSpace(values[key])
		if val == "" {
			val = strings.TrimSpace(def.Default)
		}
		if def.Required && val == "" {
			return fmt.Errorf("variable %q is required", key)
		}
	}
	return nil
}
