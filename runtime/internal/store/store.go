package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

type Store struct {
	DB   *sql.DB
	Path string
}

func Open() (*Store, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("user config dir: %w", err)
	}

	dir := filepath.Join(configDir, "Orbit Reader")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir data dir: %w", err)
	}

	dbPath := filepath.Join(dir, "orbit.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}

	s := &Store{DB: db, Path: dbPath}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}

	return s, nil
}

func (s *Store) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS bookmarks (
			id TEXT PRIMARY KEY,
			plugin_id TEXT NOT NULL,
			title TEXT NOT NULL,
			url TEXT,
			created_at INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			article_id TEXT NOT NULL,
			plugin_id TEXT NOT NULL,
			title TEXT NOT NULL,
			read_at INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS plugins (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			manifest_json TEXT NOT NULL,
			active INTEGER NOT NULL DEFAULT 1,
			sort_order INTEGER NOT NULL DEFAULT 0,
			installed_at INTEGER NOT NULL,
			last_fetch_at INTEGER,
			last_error TEXT,
			source TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS feed_items (
			id TEXT PRIMARY KEY,
			plugin_id TEXT NOT NULL,
			title TEXT NOT NULL,
			summary TEXT,
			cover TEXT,
			media_type TEXT NOT NULL,
			source_url TEXT,
			author TEXT,
			published_at INTEGER,
			payload_json TEXT,
			fetched_at INTEGER NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_feed_items_plugin ON feed_items(plugin_id)`,
		`CREATE INDEX IF NOT EXISTS idx_feed_items_published ON feed_items(published_at DESC)`,
	}
	for _, stmt := range stmts {
		if _, err := s.DB.Exec(stmt); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}
	return nil
}

func (s *Store) Close() error {
	if s.DB == nil {
		return nil
	}
	return s.DB.Close()
}
