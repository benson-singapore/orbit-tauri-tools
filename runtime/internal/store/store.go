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
	// SQLite prefers serialized writes in desktop apps; keep a single writer
	// and wait briefly on lock contention instead of failing immediately.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	if _, err := db.Exec(`PRAGMA journal_mode=WAL;`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("set journal mode: %w", err)
	}
	if _, err := db.Exec(`PRAGMA busy_timeout=5000;`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("set busy timeout: %w", err)
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
	if err := s.migrateFeedItemsChannelID(); err != nil {
		return err
	}
	if err := s.migrateFeedItemsReadAt(); err != nil {
		return err
	}
	if err := s.migratePluginGroups(); err != nil {
		return err
	}
	return nil
}

func (s *Store) migratePluginGroups() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS plugin_groups (
			id TEXT PRIMARY KEY,
			label TEXT NOT NULL,
			sort_order INTEGER NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS plugin_group_assignments (
			plugin_id TEXT PRIMARY KEY,
			group_id TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS plugin_group_collapsed (
			group_id TEXT PRIMARY KEY,
			collapsed INTEGER NOT NULL DEFAULT 0
		)`,
	}
	for _, stmt := range stmts {
		if _, err := s.DB.Exec(stmt); err != nil {
			return fmt.Errorf("migrate plugin groups: %w", err)
		}
	}
	return nil
}

func (s *Store) migrateFeedItemsChannelID() error {
	var count int
	err := s.DB.QueryRow(
		`SELECT COUNT(*) FROM pragma_table_info('feed_items') WHERE name = 'channel_id'`,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("check channel_id column: %w", err)
	}
	if count > 0 {
		return nil
	}
	if _, err := s.DB.Exec(
		`ALTER TABLE feed_items ADD COLUMN channel_id TEXT NOT NULL DEFAULT 'main'`,
	); err != nil {
		return fmt.Errorf("add channel_id column: %w", err)
	}
	_, _ = s.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_feed_items_plugin_channel ON feed_items(plugin_id, channel_id)`)
	return nil
}

func (s *Store) migrateFeedItemsReadAt() error {
	var count int
	err := s.DB.QueryRow(
		`SELECT COUNT(*) FROM pragma_table_info('feed_items') WHERE name = 'read_at'`,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("check read_at column: %w", err)
	}
	if count > 0 {
		return nil
	}
	if _, err := s.DB.Exec(`ALTER TABLE feed_items ADD COLUMN read_at INTEGER`); err != nil {
		return fmt.Errorf("add read_at column: %w", err)
	}
	_, _ = s.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_feed_items_unread ON feed_items(read_at) WHERE read_at IS NULL`)
	return nil
}

func (s *Store) Close() error {
	if s.DB == nil {
		return nil
	}
	return s.DB.Close()
}
