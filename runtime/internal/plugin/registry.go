package plugin

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/orbit-tauri-tools/runtime/internal/store"
)

type Registry struct {
	store     *store.Store
	fetcher   *RSSFetcher
	wasmExec  *WASMExecutor
	mu        sync.RWMutex
	records   map[string]*PluginRecord
	pluginDir        map[string]string // plugin id -> absolute package dir
	bundledOnDisk    map[string]manifestOnDisk
	refreshMu        sync.Map          // plugin id -> *sync.Mutex
}

func NewRegistry(st *store.Store) *Registry {
	return &Registry{
		store:     st,
		fetcher:   NewRSSFetcher(),
		wasmExec:  NewWASMExecutor(),
		records:   make(map[string]*PluginRecord),
		pluginDir:     make(map[string]string),
		bundledOnDisk: make(map[string]manifestOnDisk),
	}
}

// Sync scans plugin directories and reconciles with SQLite.
func (r *Registry) Sync(ctx context.Context) error {
	dirs, err := DiscoverDirs()
	if err != nil {
		return err
	}

	disk := make(map[string]manifestOnDisk)
	for _, dir := range dirs {
		if err := r.scanDir(dir, disk); err != nil {
			return err
		}
	}

	dbRows, err := r.store.ListPlugins(ctx)
	if err != nil {
		return err
	}
	dbByID := make(map[string]store.PluginRow, len(dbRows))
	for _, row := range dbRows {
		dbByID[row.ID] = row
	}

	now := time.Now().Unix()
	for id, onDisk := range disk {
		m := onDisk.manifest
		m.Bundled = onDisk.bundled

		row, exists := dbByID[id]
		if !exists {
			// Bundled plugins are opt-in in production; dev mode can auto-install official ones.
			if onDisk.bundled {
				if !devAutoInstallBundled(m) {
					continue
				}
			}
			rec := &PluginRecord{
				Manifest:  *m,
				Active:    true,
				SortOrder: len(dbByID) + len(r.records),
				Installed: now,
			}
			if err := r.upsertPlugin(ctx, rec); err != nil {
				return err
			}
			r.setRecord(rec)
			continue
		}

		rec, err := rowToRecord(row)
		if err != nil {
			return err
		}
		// Refresh manifest fields from disk; keep runtime state.
		rec.Manifest = *m
		rec.Manifest.Bundled = onDisk.bundled
		if err := r.upsertPlugin(ctx, rec); err != nil {
			return err
		}
		r.setRecord(rec)
	}

	// Drop bundled plugins that were removed from disk (e.g. retired defaults).
	for id, row := range dbByID {
		if _, ok := disk[id]; ok {
			continue
		}
		rec, err := rowToRecord(row)
		if err != nil {
			return err
		}
		if !rec.Bundled {
			continue
		}
		if err := r.store.DeletePlugin(ctx, id); err != nil {
			return err
		}
		if err := r.store.DeleteFeedItemsByPlugin(ctx, id); err != nil {
			return err
		}
	}

	r.syncPluginDirs(disk)

	return r.loadFromDB(ctx)
}

func devAutoInstallBundled(m *Manifest) bool {
	if os.Getenv("ORBIT_DEV_AUTO_INSTALL") != "1" {
		return false
	}
	return m.Meta.Official
}

type manifestOnDisk struct {
	manifest *Manifest
	bundled  bool
	dir      string
}

func (r *Registry) scanDir(root string, out map[string]manifestOnDisk) error {
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	userDir, _ := UserPluginsDir()
	userDir = filepath.Clean(userDir)

	for _, ent := range entries {
		if !ent.IsDir() {
			continue
		}
		manifestPath := filepath.Join(root, ent.Name(), "manifest.json")
		if _, err := os.Stat(manifestPath); err != nil {
			continue
		}
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			return fmt.Errorf("read %s: %w", manifestPath, err)
		}
		m, err := ParseManifestBytes(data)
		if err != nil {
			return fmt.Errorf("parse %s: %w", manifestPath, err)
		}
		pluginDir := filepath.Join(root, ent.Name())
		if err := ValidateManifestOnDisk(pluginDir, m); err != nil {
			return fmt.Errorf("%s: %w", manifestPath, err)
		}
		bundled := filepath.Clean(root) != userDir
		dir := pluginDir
		if prev, ok := out[m.ID]; ok {
			// Later dirs override earlier; user dir wins over bundled.
			if prev.bundled && !bundled {
				out[m.ID] = manifestOnDisk{manifest: m, bundled: bundled, dir: dir}
			}
			continue
		}
		out[m.ID] = manifestOnDisk{manifest: m, bundled: bundled, dir: dir}
	}
	return nil
}

func (r *Registry) loadFromDB(ctx context.Context) error {
	rows, err := r.store.ListPlugins(ctx)
	if err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.records = make(map[string]*PluginRecord, len(rows))
	for _, row := range rows {
		rec, err := rowToRecord(row)
		if err != nil {
			return err
		}
		r.records[row.ID] = rec
	}
	return nil
}

func (r *Registry) setPluginDir(id, dir string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if dir == "" {
		delete(r.pluginDir, id)
		return
	}
	r.pluginDir[id] = dir
}

func (r *Registry) getPluginDir(id string) (string, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	dir, ok := r.pluginDir[id]
	return dir, ok
}

func (r *Registry) syncPluginDirs(disk map[string]manifestOnDisk) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pluginDir = make(map[string]string, len(disk))
	r.bundledOnDisk = make(map[string]manifestOnDisk)
	for id, onDisk := range disk {
		r.pluginDir[id] = onDisk.dir
		if onDisk.bundled && onDisk.manifest != nil && onDisk.manifest.Meta.Official {
			r.bundledOnDisk[id] = onDisk
		}
	}
}

// ListMarketPlugins returns official bundled plugins on disk that are not installed yet.
func (r *Registry) ListMarketPlugins() []*PluginRecord {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*PluginRecord, 0, len(r.bundledOnDisk))
	for id, onDisk := range r.bundledOnDisk {
		if _, installed := r.records[id]; installed {
			continue
		}
		m := *onDisk.manifest
		m.Bundled = true
		out = append(out, &PluginRecord{
			Manifest:  m,
			Active:    false,
			SortOrder: 0,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// InstallOrbitFromMarket downloads a .orbit package from the remote market API and installs it.
func (r *Registry) InstallOrbitFromMarket(ctx context.Context, marketDownloader func(context.Context, string) ([]byte, error), marketID string) (*PluginRecord, error) {
	data, err := marketDownloader(ctx, marketID)
	if err != nil {
		return nil, err
	}
	return r.InstallOrbit(ctx, data)
}

// InstallBundled registers a bundled official plugin from disk into SQLite.
func (r *Registry) InstallBundled(ctx context.Context, id string) (*PluginRecord, error) {
	r.mu.RLock()
	onDisk, ok := r.bundledOnDisk[id]
	if _, exists := r.records[id]; exists {
		r.mu.RUnlock()
		return nil, fmt.Errorf("plugin already installed: %s", id)
	}
	r.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("bundled plugin not found: %s", id)
	}
	now := time.Now().Unix()
	m := *onDisk.manifest
	m.Bundled = true
	rec := &PluginRecord{
		Manifest:  m,
		Active:    true,
		SortOrder: 1000,
		Installed: now,
	}
	if err := r.upsertPlugin(ctx, rec); err != nil {
		return nil, err
	}
	r.setRecord(rec)
	r.setPluginDir(id, onDisk.dir)
	return cloneRecord(rec), nil
}

// PluginAssetPath resolves a relative asset path within a plugin package directory.
func (r *Registry) PluginAssetPath(pluginID, relPath string) (string, error) {
	relPath = strings.TrimPrefix(filepath.Clean(relPath), string(filepath.Separator))
	if relPath == "." || strings.HasPrefix(relPath, "..") {
		return "", fmt.Errorf("invalid asset path")
	}
	dir, ok := r.getPluginDir(pluginID)
	if !ok {
		return "", fmt.Errorf("plugin not found: %s", pluginID)
	}
	full := filepath.Join(dir, relPath)
	if !strings.HasPrefix(filepath.Clean(full), filepath.Clean(dir)) {
		return "", fmt.Errorf("invalid asset path")
	}
	if _, err := os.Stat(full); err != nil {
		return "", err
	}
	return full, nil
}

func rowToRecord(row store.PluginRow) (*PluginRecord, error) {
	var m Manifest
	if err := store.DecodeJSON(row.ManifestJSON, &m); err != nil {
		return nil, err
	}
	MigrateManifestConfig(&m.Config)
	return &PluginRecord{
		Manifest:  m,
		Active:    row.Active,
		SortOrder: row.SortOrder,
		Installed: row.InstalledAt,
		LastFetch: row.LastFetchAt,
		LastError: row.LastError,
	}, nil
}

func (r *Registry) setRecord(rec *PluginRecord) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.records[rec.ID] = rec
}

func (r *Registry) List() []*PluginRecord {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*PluginRecord, 0, len(r.records))
	for _, rec := range r.records {
		out = append(out, cloneRecord(rec))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].Name < out[j].Name
	})
	return out
}

func (r *Registry) ReorderPlugins(ctx context.Context, orderedIDs []string) error {
	if len(orderedIDs) == 0 {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	seen := make(map[string]struct{}, len(orderedIDs))
	for i, id := range orderedIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			return fmt.Errorf("empty plugin id in order list")
		}
		if _, dup := seen[id]; dup {
			return fmt.Errorf("duplicate plugin id in order list: %s", id)
		}
		seen[id] = struct{}{}

		rec, ok := r.records[id]
		if !ok {
			return fmt.Errorf("plugin not found: %s", id)
		}
		rec.SortOrder = i
		if err := r.upsertPlugin(ctx, rec); err != nil {
			return err
		}
	}
	return nil
}

func (r *Registry) Get(id string) (*PluginRecord, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	rec, ok := r.records[id]
	if !ok {
		return nil, false
	}
	return cloneRecord(rec), true
}

func cloneRecord(rec *PluginRecord) *PluginRecord {
	cp := *rec
	cp.Capabilities = append([]string(nil), rec.Capabilities...)
	cp.Config.Channels = append([]FeedChannel(nil), rec.Config.Channels...)
	return &cp
}

func (r *Registry) InstallRSS(ctx context.Context, opts InstallRSSOptions) (*PluginRecord, error) {
	channels := opts.Channels
	if len(channels) == 0 {
		feedURL := strings.TrimSpace(opts.FeedURL)
		if feedURL == "" {
			return nil, fmt.Errorf("channels or feedUrl is required")
		}
		channels = []FeedChannel{{
			ID:      DefaultChannelID,
			Label:   "全部",
			FeedURL: feedURL,
		}}
	}
	seedURL := channels[0].FeedURL
	id := strings.TrimSpace(opts.ID)
	if id == "" {
		sum := sha256Hex(seedURL)
		id = "rss-" + sum[:10]
	}
	name := strings.TrimSpace(opts.Name)
	if name == "" {
		name = hostnameFromURL(seedURL)
	}

	m := NewRSSManifest(id, name, channels)
	if dc := strings.TrimSpace(opts.DefaultChannel); dc != "" {
		m.Config.DefaultChannel = dc
	}
	if opts.RefreshInterval > 0 {
		m.Config.RefreshInterval = opts.RefreshInterval
	}
	if ua := strings.TrimSpace(opts.UserAgent); ua != "" {
		m.Config.UserAgent = ua
	}
	if mt := strings.TrimSpace(opts.MediaType); mt != "" {
		m.MediaType = mt
	}
	if icon := strings.TrimSpace(opts.Icon); icon != "" {
		m.Meta.Icon = icon
		if strings.TrimSpace(opts.MediaType) == "" {
			m.MediaType = MediaTypeFromIcon(icon)
		}
	}
	if v := strings.TrimSpace(opts.Description); v != "" {
		m.Meta.Description = v
	}
	if v := strings.TrimSpace(opts.Color); v != "" {
		m.Meta.Color = v
	}
	if v := strings.TrimSpace(opts.LogoText); v != "" {
		runes := []rune(v)
		m.Meta.LogoText = string(runes[0])
	}
	if v := strings.TrimSpace(opts.LogoImageURL); v != "" {
		m.Meta.LogoImageURL = v
	}
	if v := strings.TrimSpace(opts.MarketCategory); v != "" {
		m.Meta.MarketCategory = v
	}
	if v := strings.TrimSpace(opts.CategoryTag); v != "" {
		m.Meta.CategoryTag = v
	}
	if err := ValidateManifest(m); err != nil {
		return nil, err
	}
	userDir, err := UserPluginsDir()
	if err != nil {
		return nil, err
	}
	pluginDir := filepath.Join(userDir, id)
	if err := SaveManifest(pluginDir, m); err != nil {
		return nil, err
	}

	rec := &PluginRecord{
		Manifest:  *m,
		Active:    true,
		SortOrder: 1000,
		Installed: time.Now().Unix(),
	}
	if err := r.upsertPlugin(ctx, rec); err != nil {
		return nil, err
	}
	r.setRecord(rec)
	r.ScheduleInitialRefresh(id)
	return cloneRecord(rec), nil
}

func (r *Registry) SetActive(ctx context.Context, id string, active bool) (*PluginRecord, error) {
	rec, ok := r.Get(id)
	if !ok {
		return nil, fmt.Errorf("plugin not found: %s", id)
	}
	rec.Active = active
	if err := r.upsertPlugin(ctx, rec); err != nil {
		return nil, err
	}
	r.setRecord(rec)
	return cloneRecord(rec), nil
}

func (r *Registry) Uninstall(ctx context.Context, id string) error {
	rec, ok := r.Get(id)
	if !ok {
		return fmt.Errorf("plugin not found: %s", id)
	}
	if !rec.Bundled {
		userDir, err := UserPluginsDir()
		if err != nil {
			return err
		}
		_ = os.RemoveAll(filepath.Join(userDir, id))
	}
	if err := r.store.DeletePlugin(ctx, id); err != nil {
		return err
	}
	if err := r.store.DeleteFeedItemsByPlugin(ctx, id); err != nil {
		return err
	}
	r.mu.Lock()
	delete(r.records, id)
	r.mu.Unlock()
	return nil
}

func (r *Registry) ForceRefreshPlugin(ctx context.Context, pluginID, channelID string) ([]FeedItem, error) {
	if _, ok := r.Get(pluginID); !ok {
		return nil, fmt.Errorf("plugin not found: %s", pluginID)
	}
	if err := r.store.DeleteFeedItemsByPlugin(ctx, pluginID); err != nil {
		return nil, err
	}
	return r.RefreshPlugin(ctx, pluginID, channelID)
}

func (r *Registry) RefreshPlugin(ctx context.Context, pluginID, channelID string) ([]FeedItem, error) {
	mu := r.pluginRefreshMutex(pluginID)
	mu.Lock()
	defer mu.Unlock()

	rec, ok := r.Get(pluginID)
	if !ok {
		return nil, fmt.Errorf("plugin not found: %s", pluginID)
	}
	if !rec.Active {
		return nil, fmt.Errorf("plugin is disabled: %s", pluginID)
	}
	runCtx, cancel := r.detachRefreshContext(ctx, rec, channelID)
	defer cancel()
	ctx = runCtx
	if rec.Source != SourceRSS && rec.Source != SourceWASM {
		return nil, fmt.Errorf("unsupported plugin source: %s", rec.Source)
	}
	if rec.Source == SourceWASM {
		if rec.Config.ExecutionMode != ExecutionWASM && rec.Config.ExecutionMode != "" {
			return nil, fmt.Errorf("execution mode %q is not implemented yet", rec.Config.ExecutionMode)
		}
	}

	var refreshErr error
	var all []FeedItem
	channels := rec.Config.Channels
	if channelID != "" {
		ch, ok := findChannel(channels, channelID)
		if !ok {
			return nil, fmt.Errorf("channel not found: %s", channelID)
		}
		items, err := r.refreshChannel(ctx, rec, ch)
		if err != nil {
			return nil, err
		}
		all = items
	} else {
		for _, ch := range channels {
			items, err := r.refreshChannel(ctx, rec, &ch)
			if err != nil {
				refreshErr = err
				continue
			}
			all = append(all, items...)
		}
		if refreshErr != nil && len(all) == 0 {
			return nil, refreshErr
		}
	}

	sort.Slice(all, func(i, j int) bool {
		return all[i].PublishedAt > all[j].PublishedAt
	})

	now := time.Now().Unix()
	rec.LastFetch = now
	if refreshErr != nil {
		rec.LastError = refreshErr.Error()
	} else {
		rec.LastError = ""
	}
	_ = r.upsertPlugin(ctx, rec)
	r.setRecord(rec)
	return all, nil
}

func (r *Registry) refreshChannel(ctx context.Context, rec *PluginRecord, ch *FeedChannel) ([]FeedItem, error) {
	var items []FeedItem
	var err error
	switch rec.Source {
	case SourceRSS:
		items, err = r.fetcher.FetchFeedURL(ctx, &rec.Manifest, ch.FeedURL)
	case SourceWASM:
		dir, ok := r.getPluginDir(rec.ID)
		if !ok {
			return nil, fmt.Errorf("plugin dir not found for %s", rec.ID)
		}
		items, err = r.wasmExec.FetchChannel(ctx, dir, rec, ch)
	default:
		return nil, fmt.Errorf("unsupported plugin source: %s", rec.Source)
	}
	now := time.Now().Unix()
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].ChannelID = ch.ID
	}
	if err := r.persistFeedItemsForChannel(ctx, rec.ID, ch.ID, items, now, ChannelItemLimit(ch)); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *Registry) loadFeedItemsForPlugin(ctx context.Context, rec *PluginRecord, channelID, search string) ([]FeedItem, bool, error) {
	channelID = ResolveChannelID(&rec.Config, channelID)
	if channelID != "" {
		return r.loadFeedItems(ctx, rec.ID, channelID, search)
	}
	var all []FeedItem
	needsBackfill := false
	for _, ch := range rec.Config.Channels {
		items, backfill, err := r.loadFeedItems(ctx, rec.ID, ch.ID, search)
		if err != nil {
			return nil, false, err
		}
		if backfill {
			needsBackfill = true
		}
		all = append(all, items...)
	}
	sort.Slice(all, func(i, j int) bool {
		return all[i].PublishedAt > all[j].PublishedAt
	})
	return all, needsBackfill, nil
}

func (r *Registry) Feed(
	ctx context.Context,
	pluginID, channelID, contentType, search string,
	scopePluginIDs []string,
) ([]FeedItem, error) {
	recs := r.List()
	if len(scopePluginIDs) > 0 {
		allowed := make(map[string]struct{}, len(scopePluginIDs))
		for _, id := range scopePluginIDs {
			id = strings.TrimSpace(id)
			if id == "" || id == "all" {
				continue
			}
			allowed[id] = struct{}{}
		}
		filtered := make([]*PluginRecord, 0, len(allowed))
		for _, rec := range recs {
			if _, ok := allowed[rec.ID]; ok {
				filtered = append(filtered, rec)
			}
		}
		recs = filtered
	} else if pluginID != "" && pluginID != "all" {
		rec, ok := r.Get(pluginID)
		if !ok {
			return nil, fmt.Errorf("plugin not found: %s", pluginID)
		}
		recs = []*PluginRecord{rec}
	}

	var all []FeedItem
	for _, rec := range recs {
		if !rec.Active || rec.ID == "all" {
			continue
		}
		if !HasCapability(&rec.Manifest, CapFeed) {
			continue
		}

		effectiveChannel := channelID
		if pluginID != "" && pluginID != "all" {
			effectiveChannel = ResolveChannelID(&rec.Config, channelID)
		} else {
			effectiveChannel = ""
		}

		items, _, err := r.loadFeedItemsForPlugin(ctx, rec, effectiveChannel, search)
		if err != nil {
			return nil, err
		}
		all = append(all, items...)
	}

	sort.Slice(all, func(i, j int) bool {
		return all[i].PublishedAt > all[j].PublishedAt
	})

	if contentType != "" {
		filtered := make([]FeedItem, 0, len(all))
		for _, item := range all {
			if item.Type == contentType {
				filtered = append(filtered, item)
			}
		}
		all = filtered
	}
	return all, nil
}

func (r *Registry) MarkFeedItemRead(ctx context.Context, id string) error {
	return r.store.MarkFeedItemRead(ctx, id, time.Now().Unix())
}

func (r *Registry) CountUnread(
	ctx context.Context,
	pluginID, channelID, contentType string,
	scopePluginIDs []string,
) (int, error) {
	if len(scopePluginIDs) > 0 {
		if channelID == "all" {
			channelID = ""
		}
		return r.store.CountUnreadFeedItemsForPlugins(ctx, scopePluginIDs, channelID, contentType)
	}
	if pluginID == "all" {
		pluginID = ""
	}
	if channelID == "all" {
		channelID = ""
	}
	if pluginID != "" {
		rec, ok := r.Get(pluginID)
		if !ok {
			return 0, fmt.Errorf("plugin not found: %s", pluginID)
		}
		if channelID != "" {
			channelID = ResolveChannelID(&rec.Config, channelID)
		}
	}
	return r.store.CountUnreadFeedItems(ctx, pluginID, channelID, contentType)
}

func (r *Registry) isStale(rec *PluginRecord) bool {
	if rec.LastFetch == 0 {
		return true
	}
	interval := DefaultRefreshInterval(rec.Config.RefreshInterval)
	return time.Since(time.Unix(rec.LastFetch, 0)) >= interval
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func hostnameFromURL(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")
	if idx := strings.Index(raw, "/"); idx >= 0 {
		raw = raw[:idx]
	}
	if raw == "" {
		return "Custom RSS"
	}
	return raw
}
