package store

import (
	"context"
	"database/sql"
	"fmt"
)

type DictRow struct {
	ID      int64
	Type    string
	Label   string
	Value   string
	Remarks string
}

var defaultDictRows = []DictRow{
	{Type: "setting_config", Label: "ai_mode", Value: "false"},
	{Type: "setting_config", Label: "tts_mode", Value: "false"},
}

func (s *Store) ListDicts(ctx context.Context, dictType string) ([]DictRow, error) {
	query := `
		SELECT id, type, label, value, COALESCE(remarks, '')
		FROM dicts
	`
	args := []any{}
	if dictType != "" {
		query += ` WHERE type = ?`
		args = append(args, dictType)
	}
	query += ` ORDER BY type ASC, label ASC`

	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []DictRow
	for rows.Next() {
		var row DictRow
		if err := rows.Scan(&row.ID, &row.Type, &row.Label, &row.Value, &row.Remarks); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Store) GetDict(ctx context.Context, dictType, label string) (DictRow, bool, error) {
	var row DictRow
	err := s.DB.QueryRowContext(ctx, `
		SELECT id, type, label, value, COALESCE(remarks, '')
		FROM dicts
		WHERE type = ? AND label = ?
	`, dictType, label).Scan(&row.ID, &row.Type, &row.Label, &row.Value, &row.Remarks)
	if err == sql.ErrNoRows {
		return DictRow{}, false, nil
	}
	if err != nil {
		return DictRow{}, false, err
	}
	return row, true, nil
}

func (s *Store) UpsertDict(ctx context.Context, row DictRow) (DictRow, error) {
	if row.Type == "" || row.Label == "" {
		return DictRow{}, fmt.Errorf("type and label are required")
	}

	res, err := s.DB.ExecContext(ctx, `
		INSERT INTO dicts (type, label, value, remarks)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(type, label) DO UPDATE SET
			value = excluded.value,
			remarks = excluded.remarks
	`, row.Type, row.Label, row.Value, nullIfEmpty(row.Remarks))
	if err != nil {
		return DictRow{}, err
	}

	id, err := res.LastInsertId()
	if err != nil || id == 0 {
		existing, ok, getErr := s.GetDict(ctx, row.Type, row.Label)
		if getErr != nil {
			return DictRow{}, getErr
		}
		if !ok {
			return DictRow{}, fmt.Errorf("dict not found after upsert")
		}
		return existing, nil
	}

	row.ID = id
	return row, nil
}

func (s *Store) DeleteDict(ctx context.Context, dictType, label string) error {
	_, err := s.DB.ExecContext(ctx, `
		DELETE FROM dicts WHERE type = ? AND label = ?
	`, dictType, label)
	return err
}

func (s *Store) seedDefaultDicts() error {
	for _, row := range defaultDictRows {
		if _, err := s.DB.Exec(`
			INSERT OR IGNORE INTO dicts (type, label, value)
			VALUES (?, ?, ?)
		`, row.Type, row.Label, row.Value); err != nil {
			return fmt.Errorf("seed dict %s/%s: %w", row.Type, row.Label, err)
		}
	}
	return nil
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
