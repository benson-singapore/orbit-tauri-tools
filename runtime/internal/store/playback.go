package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// PlaybackRecord matches orbit-plugins playback.schema.json playbackRecord.
type PlaybackRecord struct {
	ParentID     string          `json:"parentId"`
	ChapterID    string          `json:"chapterId,omitempty"`
	ChannelID    string          `json:"channelId,omitempty"`
	ParentTitle  string          `json:"parentTitle,omitempty"`
	ChapterTitle string          `json:"chapterTitle,omitempty"`
	Cover        string          `json:"cover,omitempty"`
	Mode         string          `json:"mode,omitempty"`
	Progress     json.RawMessage `json:"progress,omitempty"`
	UpdatedAt    int64           `json:"updatedAt"`
}

func (s *Store) ListPlaybackRecords(
	ctx context.Context,
	pluginID string,
	limit, offset int,
) ([]PlaybackRecord, int, error) {
	var total int
	if err := s.DB.QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM playback_records WHERE plugin_id = ?`,
		pluginID,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count playback records: %w", err)
	}

	rows, err := s.DB.QueryContext(
		ctx,
		`SELECT parent_id, chapter_id, channel_id, parent_title, chapter_title, cover, mode, progress_json, updated_at
		 FROM playback_records
		 WHERE plugin_id = ?
		 ORDER BY updated_at DESC
		 LIMIT ? OFFSET ?`,
		pluginID, limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list playback records: %w", err)
	}
	defer rows.Close()

	items, err := scanPlaybackRows(rows)
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (s *Store) GetPlaybackRecord(ctx context.Context, pluginID, parentID string) (*PlaybackRecord, error) {
	row := s.DB.QueryRowContext(
		ctx,
		`SELECT parent_id, chapter_id, channel_id, parent_title, chapter_title, cover, mode, progress_json, updated_at
		 FROM playback_records
		 WHERE plugin_id = ? AND parent_id = ?`,
		pluginID, parentID,
	)
	rec, err := scanPlaybackRow(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get playback record: %w", err)
	}
	return rec, nil
}

func (s *Store) PutPlaybackRecord(ctx context.Context, pluginID string, rec PlaybackRecord, limit int) error {
	if rec.UpdatedAt <= 0 {
		rec.UpdatedAt = time.Now().Unix()
	}
	progressJSON := sql.NullString{}
	if len(rec.Progress) > 0 && string(rec.Progress) != "null" {
		progressJSON = sql.NullString{String: string(rec.Progress), Valid: true}
	}

	_, err := s.DB.ExecContext(
		ctx,
		`INSERT INTO playback_records (
			plugin_id, parent_id, chapter_id, channel_id, parent_title, chapter_title, cover, mode, progress_json, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(plugin_id, parent_id) DO UPDATE SET
			chapter_id = excluded.chapter_id,
			channel_id = excluded.channel_id,
			parent_title = excluded.parent_title,
			chapter_title = excluded.chapter_title,
			cover = excluded.cover,
			mode = excluded.mode,
			progress_json = excluded.progress_json,
			updated_at = excluded.updated_at`,
		pluginID,
		rec.ParentID,
		nullString(rec.ChapterID),
		nullString(rec.ChannelID),
		nullString(rec.ParentTitle),
		nullString(rec.ChapterTitle),
		nullString(rec.Cover),
		rec.Mode,
		progressJSON,
		rec.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("put playback record: %w", err)
	}
	if limit > 0 {
		if err := s.prunePlaybackRecords(ctx, pluginID, limit); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) DeletePlaybackRecord(ctx context.Context, pluginID, parentID string) error {
	_, err := s.DB.ExecContext(
		ctx,
		`DELETE FROM playback_records WHERE plugin_id = ? AND parent_id = ?`,
		pluginID, parentID,
	)
	if err != nil {
		return fmt.Errorf("delete playback record: %w", err)
	}
	return nil
}

func (s *Store) DeleteAllPlaybackRecords(ctx context.Context, pluginID string) error {
	_, err := s.DB.ExecContext(
		ctx,
		`DELETE FROM playback_records WHERE plugin_id = ?`,
		pluginID,
	)
	if err != nil {
		return fmt.Errorf("delete all playback records: %w", err)
	}
	return nil
}

func (s *Store) prunePlaybackRecords(ctx context.Context, pluginID string, limit int) error {
	_, err := s.DB.ExecContext(
		ctx,
		`DELETE FROM playback_records
		 WHERE plugin_id = ?
		   AND rowid NOT IN (
		     SELECT rowid FROM playback_records
		     WHERE plugin_id = ?
		     ORDER BY updated_at DESC
		     LIMIT ?
		   )`,
		pluginID, pluginID, limit,
	)
	if err != nil {
		return fmt.Errorf("prune playback records: %w", err)
	}
	return nil
}

func scanPlaybackRows(rows *sql.Rows) ([]PlaybackRecord, error) {
	var items []PlaybackRecord
	for rows.Next() {
		rec, err := scanPlaybackRow(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *rec)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate playback rows: %w", err)
	}
	if items == nil {
		items = []PlaybackRecord{}
	}
	return items, nil
}

type playbackScanner interface {
	Scan(dest ...any) error
}

func scanPlaybackRow(row playbackScanner) (*PlaybackRecord, error) {
	var (
		parentID, chapterID, channelID sql.NullString
		parentTitle, chapterTitle      sql.NullString
		cover                          sql.NullString
		mode                           string
		progressJSON                   sql.NullString
		updatedAt                      int64
	)
	if err := row.Scan(
		&parentID, &chapterID, &channelID, &parentTitle, &chapterTitle, &cover, &mode, &progressJSON, &updatedAt,
	); err != nil {
		return nil, err
	}
	rec := &PlaybackRecord{
		ParentID:  parentID.String,
		Mode:      mode,
		UpdatedAt: updatedAt,
	}
	if chapterID.Valid {
		rec.ChapterID = chapterID.String
	}
	if channelID.Valid {
		rec.ChannelID = channelID.String
	}
	if parentTitle.Valid {
		rec.ParentTitle = parentTitle.String
	}
	if chapterTitle.Valid {
		rec.ChapterTitle = chapterTitle.String
	}
	if cover.Valid {
		rec.Cover = cover.String
	}
	if progressJSON.Valid && progressJSON.String != "" {
		rec.Progress = json.RawMessage(progressJSON.String)
	}
	return rec, nil
}

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
