package plugin

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
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
	dispatch  *FeatureDispatcher
	refreshQueue *RefreshQueue
	mu        sync.RWMutex
	records   map[string]*PluginRecord
	pluginDir        map[string]string // plugin id -> absolute package dir
	bundledOnDisk    map[string]manifestOnDisk
	refreshMu        sync.Map          // plugin id -> *sync.Mutex
}

func NewRegistry(st *store.Store) *Registry {
	reg := &Registry{
		store:     st,
		fetcher:   NewRSSFetcher(),
		wasmExec:  NewWASMExecutor(),
		records:   make(map[string]*PluginRecord),
		pluginDir:     make(map[string]string),
		bundledOnDisk: make(map[string]manifestOnDisk),
	}
	reg.dispatch = NewFeatureDispatcher(reg)
	reg.refreshQueue = newRefreshQueue(reg)
	return reg
}

func (r *Registry) Dispatcher() *FeatureDispatcher {
	return r.dispatch
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
		// Refresh manifest fields from disk; keep runtime state and market metadata.
		contentRating := rec.ContentRating
		rec.Manifest = *m
		rec.Manifest.Bundled = onDisk.bundled
		rec.ContentRating = contentRating
		rec.Manifest.Meta.ContentRating = ""
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
		if err := r.store.DeletePluginCachedData(ctx, id); err != nil {
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
		if !bundled && rawManifestHasLegacyV1Fields(data) {
			if err := SaveManifest(pluginDir, m); err != nil {
				return fmt.Errorf("migrate manifest %s: %w", manifestPath, err)
			}
		}
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
// If the plugin is already installed, the package is applied as a full replace (same as update).
func (r *Registry) InstallOrbitFromMarket(
	ctx context.Context,
	marketDownloader func(context.Context, string) ([]byte, error),
	marketID, contentRating string,
	ratingFetcher func(context.Context, string) (string, error),
) (*PluginRecord, error) {
	data, err := marketDownloader(ctx, marketID)
	if err != nil {
		return nil, err
	}
	_, m, _, err := parseOrbitZip(data)
	if err != nil {
		return nil, err
	}
	var rec *PluginRecord
	if _, exists := r.Get(m.ID); exists {
		rec, err = r.updateOrbitPackage(ctx, m.ID, data)
	} else {
		rec, err = r.InstallOrbit(ctx, data)
	}
	if err != nil {
		return nil, err
	}
	return r.applyMarketPluginMetadata(ctx, rec, marketID, contentRating, ratingFetcher)
}

func (r *Registry) applyMarketPluginMetadata(
	ctx context.Context,
	rec *PluginRecord,
	marketID, contentRating string,
	ratingFetcher func(context.Context, string) (string, error),
) (*PluginRecord, error) {
	changed := false
	marketID = strings.TrimSpace(marketID)
	if marketID != "" && rec.Meta.MarketID != marketID {
		rec.Meta.MarketID = marketID
		changed = true
	}

	rating := NormalizeContentRating(contentRating)
	if rating == "" && marketID != "" && ratingFetcher != nil {
		if fetched, err := ratingFetcher(ctx, marketID); err == nil {
			rating = NormalizeContentRating(fetched)
		}
	}
	ratingChanged := rating != "" && rec.ContentRating != rating
	if !changed && !ratingChanged {
		return rec, nil
	}
	var err error
	if changed {
		rec, err = r.UpdateManifest(ctx, rec.ID, &rec.Manifest)
		if err != nil {
			return nil, err
		}
	}
	if ratingChanged {
		rec.ContentRating = rating
		if err := r.upsertPlugin(ctx, rec); err != nil {
			return nil, err
		}
		r.setRecord(rec)
	}
	return cloneRecord(rec), nil
}

// UpdateOrbitFromMarket downloads a newer .orbit package and fully replaces on-disk assets and manifest.
func (r *Registry) UpdateOrbitFromMarket(
	ctx context.Context,
	marketDownloader func(context.Context, string) ([]byte, error),
	marketID, pluginID, contentRating string,
	ratingFetcher func(context.Context, string) (string, error),
) (*PluginRecord, error) {
	pluginID = strings.TrimSpace(pluginID)
	if pluginID == "" {
		return nil, fmt.Errorf("pluginId is required")
	}
	rec, ok := r.Get(pluginID)
	if !ok {
		return nil, fmt.Errorf("plugin not found: %s", pluginID)
	}
	if rec.Bundled {
		return nil, fmt.Errorf("cannot update bundled plugin: %s", pluginID)
	}
	if rec.Source != SourceWASM {
		return nil, fmt.Errorf("only wasm plugins can be updated from market: %s", pluginID)
	}

	data, err := marketDownloader(ctx, marketID)
	if err != nil {
		return nil, err
	}
	updated, err := r.updateOrbitPackage(ctx, pluginID, data)
	if err != nil {
		return nil, err
	}
	return r.applyMarketPluginMetadata(ctx, updated, marketID, contentRating, ratingFetcher)
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
	contentRating := NormalizeContentRating(row.ContentRating)
	if contentRating == "" {
		contentRating = NormalizeContentRating(m.Meta.ContentRating)
	}
	m.Meta.ContentRating = ""
	return &PluginRecord{
		Manifest:      m,
		ContentRating: contentRating,
		Active:        row.Active,
		SortOrder:     row.SortOrder,
		Installed:     row.InstalledAt,
		LastFetch:     row.LastFetchAt,
		LastError:     row.LastError,
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
	if len(rec.Config.Secrets) > 0 {
		cp.Config.Secrets = make(map[string]string, len(rec.Config.Secrets))
		for k, v := range rec.Config.Secrets {
			cp.Config.Secrets[k] = v
		}
	}
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
	if active {
		r.refreshQueue.SchedulePluginRefresh(id, false)
	}
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
	if err := r.store.DeletePluginCachedData(ctx, id); err != nil {
		return err
	}
	r.dispatch.ClearPluginSessions(id)
	r.mu.Lock()
	delete(r.records, id)
	r.mu.Unlock()
	return nil
}

func (r *Registry) ForceRefreshPlugin(ctx context.Context, pluginID, channelID string) ([]FeedItem, error) {
	rec, ok := r.Get(pluginID)
	if !ok {
		return nil, fmt.Errorf("plugin not found: %s", pluginID)
	}
	if channelID != "" {
		if err := r.store.DeleteFeedItemsByChannel(ctx, pluginID, channelID); err != nil {
			return nil, err
		}
		r.dispatch.ClearChannelSession(pluginID, channelID)
	} else if err := r.store.DeleteFeedItemsByPlugin(ctx, pluginID); err != nil {
		return nil, err
	}
	if channelID == "" && rec.Source == SourceWASM {
		r.refreshQueue.SchedulePluginRefresh(pluginID, true)
		return []FeedItem{}, nil
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
		if !ChannelEnabled(ch) {
			return []FeedItem{}, nil
		}
		if !ChannelFeedRefresh(ch) {
			return []FeedItem{}, nil
		}
		items, err := r.refreshChannel(ctx, rec, ch)
		if err != nil {
			return nil, err
		}
		all = items
	} else {
		if rec.Source == SourceWASM {
			r.refreshQueue.SchedulePluginRefresh(pluginID, false)
			items, _, err := r.loadFeedItemsForPlugin(ctx, rec, "", "")
			if err != nil {
				return nil, err
			}
			sort.Slice(items, func(i, j int) bool {
				return items[i].PublishedAt > items[j].PublishedAt
			})
			return dedupeFeedItems(items), nil
		}
		for _, ch := range channels {
			if !ChannelEnabled(&ch) {
				continue
			}
			if !ChannelFeedRefresh(&ch) {
				continue
			}
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
	all = dedupeFeedItems(all)

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
		result, err := r.dispatch.Refresh(ctx, rec.ID, ch.ID)
		if err != nil {
			return nil, err
		}
		return result.Items, nil
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
	if err := r.persistFeedItemsForChannel(ctx, rec.ID, ch.ID, items, now, FeedItemLimit(ch)); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *Registry) loadFeedItemsForPlugin(ctx context.Context, rec *PluginRecord, channelID, search string) ([]FeedItem, bool, error) {
	channelID = ResolveChannelID(&rec.Config, channelID)
	if channelID != "" {
		if ch, ok := findChannel(rec.Config.Channels, channelID); ok {
			if !ChannelEnabled(ch) {
				return []FeedItem{}, false, nil
			}
			if !ChannelFeedPersist(ch) {
				return []FeedItem{}, false, nil
			}
		}
		return r.loadFeedItems(ctx, rec.ID, channelID, search)
	}
	var all []FeedItem
	needsBackfill := false
	for _, ch := range rec.Config.Channels {
		if !ChannelEnabled(&ch) {
			continue
		}
		if !ChannelFeedPersist(&ch) {
			continue
		}
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
	all = dedupeFeedItems(all)
	return all, needsBackfill, nil
}

func (r *Registry) Feed(
	ctx context.Context,
	pluginID, channelID, contentType, search string,
	scopePluginIDs []string,
	limit, offset int,
) (FeedQueryResult, error) {
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
			return FeedQueryResult{}, fmt.Errorf("plugin not found: %s", pluginID)
		}
		recs = []*PluginRecord{rec}
	}

	globalAll := isGlobalAggregateFeed(pluginID, scopePluginIDs)
	var all []FeedItem
	prePaged := false
	for _, rec := range recs {
		if !rec.Active || rec.ID == "all" {
			continue
		}
		if globalAll && IsMatureContentRating(rec.ContentRating) {
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

		if effectiveChannel != "" {
			if ch, ok := findChannel(rec.Config.Channels, effectiveChannel); ok {
				isDynamic := ChannelDynamic(ch)
				browseDynamic := ChannelBrowseDynamic(ch, rec.MediaType)
				log.Printf(
					"[orbit-feed] channel resolve plugin=%q channel=%q found=%v dynamic=%v browseDynamic=%v route=%q ch_params=%s",
					rec.ID, effectiveChannel, ok, isDynamic, browseDynamic, ch.Route, mustJSON(ch.Params),
				)
				if isDynamic {
					var result DispatchResult
					var err error
					if strings.TrimSpace(search) != "" {
						result, err = r.dispatch.Search(ctx, rec.ID, effectiveChannel, search)
					} else {
						result, err = r.dispatch.ListItems(ctx, rec.ID, effectiveChannel, limit, offset)
					}
					if err != nil {
						return FeedQueryResult{}, err
					}
					all = append(all, result.Items...)
					prePaged = true
					continue
				}
				if browseDynamic {
					result, err := r.dispatch.ListItems(ctx, rec.ID, effectiveChannel, limit, offset)
					if err != nil {
						return FeedQueryResult{}, err
					}
					for i := range result.Items {
						result.Items[i].IsRead = true
					}
					all = append(all, result.Items...)
					prePaged = true
					continue
				}
			} else {
				log.Printf(
					"[orbit-feed] channel resolve plugin=%q channel=%q found=false",
					rec.ID, effectiveChannel,
				)
			}
		}

		log.Printf(
			"[orbit-feed] db path plugin=%q channel=%q q=%q limit=%d offset=%d",
			rec.ID, effectiveChannel, search, limit, offset,
		)
		items, _, err := r.loadFeedItemsForPlugin(ctx, rec, effectiveChannel, search)
		if err != nil {
			return FeedQueryResult{}, err
		}
		all = append(all, items...)
	}

	if !prePaged {
		sort.Slice(all, func(i, j int) bool {
			return all[i].PublishedAt > all[j].PublishedAt
		})
	}

	if contentType != "" {
		filtered := make([]FeedItem, 0, len(all))
		for _, item := range all {
			if item.Type == contentType {
				filtered = append(filtered, item)
			}
		}
		all = filtered
	}

	total := len(all)
	hasMore := false
	if prePaged {
		total = offset + len(all)
		page := WasmPageFromOffset(limit, offset)
		hasMore = len(all) > 0 && page < DynamicSearchMaxPages
	}

	return FeedQueryResult{
		Items:    all,
		Total:    total,
		HasMore:  hasMore,
		PrePaged: prePaged,
	}, nil
}

func mustJSON(v any) string {
	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return string(data)
}

func feedItemIDVariants(id string) []string {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil
	}
	seen := map[string]struct{}{id: {}}
	out := []string{id}
	add := func(candidate string) {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			return
		}
		if _, ok := seen[candidate]; ok {
			return
		}
		seen[candidate] = struct{}{}
		out = append(out, candidate)
	}
	if strings.HasPrefix(id, "//") {
		add("https:" + id)
	}
	lower := strings.ToLower(id)
	if strings.HasPrefix(lower, "https://") {
		add("//" + id[8:])
	} else if strings.HasPrefix(lower, "http://") {
		add("//" + id[7:])
	}
	return out
}

func feedReadStorageIDs(pluginID, channelID, id string) []string {
	pluginID = strings.TrimSpace(pluginID)
	channelID = strings.TrimSpace(channelID)

	seen := make(map[string]struct{})
	out := make([]string, 0, 8)
	appendCandidate := func(candidate string) {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			return
		}
		if _, ok := seen[candidate]; ok {
			return
		}
		seen[candidate] = struct{}{}
		out = append(out, candidate)
	}

	for _, itemID := range feedItemIDVariants(id) {
		appendCandidate(itemID)
		if pluginID != "" && !strings.HasPrefix(itemID, pluginID+":") {
			appendCandidate(pluginID + ":" + itemID)
			if channelID != "" {
				appendCandidate(FeedFullID(pluginID, channelID, itemID))
			}
		}
	}
	return out
}

func (r *Registry) MarkFeedItemRead(ctx context.Context, pluginID, channelID, id string) error {
	id = strings.TrimSpace(id)
	pluginID = strings.TrimSpace(pluginID)
	channelID = strings.TrimSpace(channelID)
	if id == "" {
		return fmt.Errorf("feed item id is required")
	}
	if pluginID != "" {
		if rec, ok := r.Get(pluginID); ok {
			channelID = ResolveChannelID(&rec.Config, channelID)
		}
	}

	var lastErr error
	for _, storageID := range feedReadStorageIDs(pluginID, channelID, id) {
		err := r.store.MarkFeedItemRead(ctx, storageID, time.Now().Unix())
		if err == nil {
			return nil
		}
		if strings.Contains(err.Error(), "not found") {
			lastErr = err
			continue
		}
		return err
	}
	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("feed item not found: %s", id)
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
	if isGlobalAggregateFeed(pluginID, scopePluginIDs) {
		if channelID == "all" {
			channelID = ""
		}
		ids := make([]string, 0)
		for _, rec := range r.List() {
			if !rec.Active || rec.ID == "all" {
				continue
			}
			if IsMatureContentRating(rec.ContentRating) {
				continue
			}
			ids = append(ids, rec.ID)
		}
		return r.store.CountUnreadFeedItemsForPlugins(ctx, ids, channelID, contentType)
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
