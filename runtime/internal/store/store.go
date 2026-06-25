package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	"github.com/orbit-tauri-tools/runtime/internal/orbitdir"

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

	dir := filepath.Join(configDir, orbitdir.Name)
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
	if err := s.migrateFeaturesV2(); err != nil {
		return err
	}
	if err := s.migrateChapterSortOrder(); err != nil {
		return err
	}
	if err := s.migrateDicts(); err != nil {
		return err
	}
	if err := s.migratePluginContentRating(); err != nil {
		return err
	}
	if err := s.migratePluginIncludeInAll(); err != nil {
		return err
	}
	if err := s.migratePlaybackRecords(); err != nil {
		return err
	}
	return nil
}

func (s *Store) migratePlaybackRecords() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS playback_records (
			plugin_id     TEXT NOT NULL,
			parent_id     TEXT NOT NULL,
			chapter_id    TEXT,
			channel_id    TEXT,
			parent_title  TEXT,
			chapter_title TEXT,
			cover         TEXT,
			mode          TEXT NOT NULL,
			progress_json TEXT,
			updated_at    INTEGER NOT NULL,
			PRIMARY KEY (plugin_id, parent_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_playback_plugin_updated
		 ON playback_records(plugin_id, updated_at DESC)`,
	}
	for _, stmt := range stmts {
		if _, err := s.DB.Exec(stmt); err != nil {
			return fmt.Errorf("migrate playback records: %w", err)
		}
	}
	return nil
}

func (s *Store) migrateFeaturesV2() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS plugin_variables (
			plugin_id TEXT NOT NULL,
			key TEXT NOT NULL,
			value TEXT NOT NULL,
			PRIMARY KEY (plugin_id, key)
		)`,
		`CREATE TABLE IF NOT EXISTS chapter_items (
			id TEXT PRIMARY KEY,
			plugin_id TEXT NOT NULL,
			channel_id TEXT NOT NULL,
			parent_id TEXT NOT NULL,
			title TEXT,
			summary TEXT,
			cover TEXT,
			payload_json TEXT,
			fetched_at INTEGER NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_chapter_parent ON chapter_items(plugin_id, channel_id, parent_id)`,
	}
	for _, stmt := range stmts {
		if _, err := s.DB.Exec(stmt); err != nil {
			return fmt.Errorf("migrate features v2: %w", err)
		}
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

func (s *Store) migrateChapterSortOrder() error {
	var count int
	err := s.DB.QueryRow(
		`SELECT COUNT(*) FROM pragma_table_info('chapter_items') WHERE name = 'sort_order'`,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("check chapter_items.sort_order: %w", err)
	}
	if count > 0 {
		return nil
	}
	if _, err := s.DB.Exec(
		`ALTER TABLE chapter_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
	); err != nil {
		return fmt.Errorf("add chapter_items.sort_order: %w", err)
	}
	_, err = s.DB.Exec(`
		UPDATE chapter_items SET sort_order = (
			SELECT COUNT(*) - 1 FROM chapter_items c2
			WHERE c2.plugin_id = chapter_items.plugin_id
			  AND c2.channel_id = chapter_items.channel_id
			  AND c2.parent_id = chapter_items.parent_id
			  AND c2.rowid <= chapter_items.rowid
		)
	`)
	if err != nil {
		return fmt.Errorf("backfill chapter_items.sort_order: %w", err)
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

func (s *Store) migrateDicts() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS dicts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL,
			label TEXT NOT NULL,
			value TEXT NOT NULL,
			remarks TEXT,
			UNIQUE(type, label)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_dicts_type ON dicts(type)`,
	}
	for _, stmt := range stmts {
		if _, err := s.DB.Exec(stmt); err != nil {
			return fmt.Errorf("migrate dicts: %w", err)
		}
	}
	return s.seedDefaultDicts()
}

func (s *Store) migratePluginContentRating() error {
	var count int
	err := s.DB.QueryRow(
		`SELECT COUNT(*) FROM pragma_table_info('plugins') WHERE name = 'content_rating'`,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("check plugins.content_rating: %w", err)
	}
	if count == 0 {
		if _, err := s.DB.Exec(`ALTER TABLE plugins ADD COLUMN content_rating TEXT NOT NULL DEFAULT ''`); err != nil {
			return fmt.Errorf("add plugins.content_rating: %w", err)
		}
	}
	_, err = s.DB.Exec(`
		UPDATE plugins
		SET content_rating = json_extract(manifest_json, '$.meta.contentRating')
		WHERE COALESCE(content_rating, '') = ''
		  AND json_extract(manifest_json, '$.meta.contentRating') IS NOT NULL
		  AND TRIM(json_extract(manifest_json, '$.meta.contentRating')) != ''
	`)
	if err != nil {
		return fmt.Errorf("backfill plugins.content_rating: %w", err)
	}
	return nil
}

func (s *Store) migratePluginIncludeInAll() error {
	var count int
	err := s.DB.QueryRow(
		`SELECT COUNT(*) FROM pragma_table_info('plugins') WHERE name = 'include_in_all'`,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("check plugins.include_in_all: %w", err)
	}
	if count == 0 {
		if _, err := s.DB.Exec(`ALTER TABLE plugins ADD COLUMN include_in_all INTEGER NOT NULL DEFAULT 0`); err != nil {
			return fmt.Errorf("add plugins.include_in_all: %w", err)
		}
		_, err = s.DB.Exec(`
			UPDATE plugins
			SET include_in_all = 1
			WHERE json_extract(manifest_json, '$.mediaType') = 'article'
			  AND COALESCE(content_rating, '') != 'mature'
		`)
		if err != nil {
			return fmt.Errorf("backfill plugins.include_in_all: %w", err)
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
