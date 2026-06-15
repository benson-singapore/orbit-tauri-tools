package plugin

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	maxOrbitPackageBytes   = 32 << 20 // 32 MiB
	defaultManifestFileName = "manifest.default.json"
)

// MarketDownloader fetches a .orbit package from the remote plugin market.
type MarketDownloader func(context.Context, string) ([]byte, error)

// InstallOrbit extracts a .orbit zip package into the user plugins directory and registers it.
func (r *Registry) InstallOrbit(ctx context.Context, data []byte) (*PluginRecord, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty orbit package")
	}
	if len(data) > maxOrbitPackageBytes {
		return nil, fmt.Errorf("orbit package exceeds %d bytes", maxOrbitPackageBytes)
	}

	m, pluginDir, err := extractOrbitPackage(data)
	if err != nil {
		return nil, err
	}
	m.Bundled = false

	if _, exists := r.Get(m.ID); exists {
		return nil, fmt.Errorf("plugin already installed: %s", m.ID)
	}

	rec := &PluginRecord{
		Manifest:  *m,
		Active:    true,
		SortOrder: 1000,
		Installed: time.Now().Unix(),
	}
	if err := r.upsertPlugin(ctx, rec); err != nil {
		_ = os.RemoveAll(pluginDir)
		return nil, err
	}
	r.setRecord(rec)
	r.setPluginDir(m.ID, pluginDir)
	r.ScheduleInitialRefresh(m.ID)
	return cloneRecord(rec), nil
}

// UpdateManifest validates and persists an updated manifest for an installed plugin.
func (r *Registry) UpdateManifest(ctx context.Context, id string, m *Manifest) (*PluginRecord, error) {
	rec, ok := r.Get(id)
	if !ok {
		return nil, fmt.Errorf("plugin not found: %s", id)
	}
	if rec.Bundled {
		return nil, fmt.Errorf("bundled plugin manifest cannot be edited: %s", id)
	}

	dir, ok := r.getPluginDir(id)
	if !ok {
		userDir, err := UserPluginsDir()
		if err != nil {
			return nil, err
		}
		dir = filepath.Join(userDir, id)
	}

	m.ID = id
	if err := SaveManifest(dir, m); err != nil {
		return nil, err
	}
	if err := ValidateManifestOnDisk(dir, m); err != nil {
		return nil, err
	}

	rec.Manifest = *m
	rec.Manifest.Bundled = false
	if err := r.upsertPlugin(ctx, rec); err != nil {
		return nil, err
	}
	r.setRecord(rec)
	r.setPluginDir(id, dir)
	return cloneRecord(rec), nil
}

// GetDefaultManifestJSON returns the original manifest from install time.
// If manifest.default.json is missing, it re-downloads the .orbit package from market
// (when marketId is known), extracts manifest.json, persists the default copy, and returns it.
func (r *Registry) GetDefaultManifestJSON(ctx context.Context, id string, download MarketDownloader) ([]byte, error) {
	dir, err := r.resolvePluginDir(id)
	if err != nil {
		return nil, err
	}

	defaultPath := filepath.Join(dir, defaultManifestFileName)
	if data, err := os.ReadFile(defaultPath); err == nil {
		return data, nil
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("read default manifest: %w", err)
	}

	rec, ok := r.Get(id)
	if !ok {
		return nil, fmt.Errorf("plugin not found: %s", id)
	}
	marketID := strings.TrimSpace(rec.Meta.MarketID)
	if marketID == "" {
		return nil, fmt.Errorf("default manifest not found and plugin has no market id")
	}
	if download == nil {
		return nil, fmt.Errorf("default manifest not found and market download is unavailable")
	}

	pkgData, err := download(ctx, marketID)
	if err != nil {
		return nil, err
	}
	_, m, manifestData, err := parseOrbitZip(pkgData)
	if err != nil {
		return nil, err
	}
	if m.ID != id {
		return nil, fmt.Errorf("market package id %q does not match plugin %q", m.ID, id)
	}
	if err := saveDefaultManifest(dir, manifestData); err != nil {
		return nil, err
	}
	return manifestData, nil
}

func saveManifestBytes(pluginDir string, manifestData []byte) error {
	path := filepath.Join(pluginDir, "manifest.json")
	if err := os.WriteFile(path, manifestData, 0o644); err != nil {
		return fmt.Errorf("write manifest: %w", err)
	}
	return nil
}

func saveDefaultManifest(pluginDir string, manifestData []byte) error {
	path := filepath.Join(pluginDir, defaultManifestFileName)
	if err := os.WriteFile(path, manifestData, 0o644); err != nil {
		return fmt.Errorf("write default manifest: %w", err)
	}
	return nil
}

func (r *Registry) resolvePluginDir(id string) (string, error) {
	dir, ok := r.getPluginDir(id)
	if ok {
		return dir, nil
	}
	if _, exists := r.Get(id); !exists {
		return "", fmt.Errorf("plugin not found: %s", id)
	}
	userDir, err := UserPluginsDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(userDir, id), nil
}

// GetManifestJSON returns the on-disk manifest.json for an installed plugin.
func (r *Registry) GetManifestJSON(id string) ([]byte, error) {
	dir, ok := r.getPluginDir(id)
	if !ok {
		if _, exists := r.Get(id); !exists {
			return nil, fmt.Errorf("plugin not found: %s", id)
		}
		userDir, err := UserPluginsDir()
		if err != nil {
			return nil, err
		}
		dir = filepath.Join(userDir, id)
	}
	path := filepath.Join(dir, "manifest.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}
	return data, nil
}

// GetPluginReadme returns README.md from an installed plugin directory.
func (r *Registry) GetPluginReadme(id string) (string, error) {
	path, err := r.PluginAssetPath(id, "README.md")
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("readme not found")
		}
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read readme: %w", err)
	}
	return string(data), nil
}

func (r *Registry) updateOrbitPackage(ctx context.Context, pluginID string, data []byte) (*PluginRecord, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty orbit package")
	}
	if len(data) > maxOrbitPackageBytes {
		return nil, fmt.Errorf("orbit package exceeds %d bytes", maxOrbitPackageBytes)
	}

	zr, _, incomingManifestRaw, err := parseOrbitZip(data)
	if err != nil {
		return nil, err
	}

	dir, ok := r.getPluginDir(pluginID)
	if !ok {
		userDir, err := UserPluginsDir()
		if err != nil {
			return nil, err
		}
		dir = filepath.Join(userDir, pluginID)
	}

	existingRaw, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		return nil, fmt.Errorf("read existing manifest: %w", err)
	}

	mergedRaw, err := mergeManifestForUpdate(existingRaw, incomingManifestRaw)
	if err != nil {
		return nil, err
	}
	merged, err := ParseManifestBytes(mergedRaw)
	if err != nil {
		return nil, err
	}
	merged.ID = pluginID

	if err := extractPackageFilesFromZip(zr, dir); err != nil {
		return nil, err
	}
	if err := SaveManifest(dir, merged); err != nil {
		return nil, err
	}
	if err := ValidateManifestOnDisk(dir, merged); err != nil {
		return nil, err
	}

	rec, ok := r.Get(pluginID)
	if !ok {
		return nil, fmt.Errorf("plugin not found: %s", pluginID)
	}
	rec.Manifest = *merged
	rec.Manifest.Bundled = false
	if err := r.upsertPlugin(ctx, rec); err != nil {
		return nil, err
	}
	r.setRecord(rec)
	r.setPluginDir(pluginID, dir)
	r.ScheduleForceRefresh(pluginID)
	return cloneRecord(rec), nil
}

func parseOrbitZip(data []byte) (*zip.Reader, *Manifest, []byte, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, nil, nil, fmt.Errorf("open orbit zip: %w", err)
	}

	entries := make(map[string]*zip.File)
	for _, f := range zr.File {
		name := strings.TrimPrefix(filepath.ToSlash(f.Name), "./")
		if name == "" || strings.HasSuffix(name, "/") {
			continue
		}
		entries[name] = f
		base := filepath.Base(name)
		if _, ok := entries[base]; !ok {
			entries[base] = f
		}
	}

	manifestFile, ok := entries["manifest.json"]
	if !ok {
		return nil, nil, nil, fmt.Errorf("manifest.json not found in orbit package")
	}
	manifestData, err := readZipEntry(manifestFile)
	if err != nil {
		return nil, nil, nil, err
	}

	m, err := ParseManifestBytes(manifestData)
	if err != nil {
		return nil, nil, nil, err
	}
	return zr, m, manifestData, nil
}

func extractOrbitPackage(data []byte) (*Manifest, string, error) {
	zr, m, manifestData, err := parseOrbitZip(data)
	if err != nil {
		return nil, "", err
	}
	if m.Source != SourceWASM && m.Source != SourceRSS {
		return nil, "", fmt.Errorf("orbit package source %q is not supported", m.Source)
	}

	userDir, err := UserPluginsDir()
	if err != nil {
		return nil, "", err
	}
	pluginDir := filepath.Join(userDir, m.ID)
	if err := os.MkdirAll(pluginDir, 0o755); err != nil {
		return nil, "", fmt.Errorf("mkdir plugin dir: %w", err)
	}

	if err := ValidateManifest(m); err != nil {
		_ = os.RemoveAll(pluginDir)
		return nil, "", err
	}
	if err := saveManifestBytes(pluginDir, manifestData); err != nil {
		_ = os.RemoveAll(pluginDir)
		return nil, "", err
	}
	if err := saveDefaultManifest(pluginDir, manifestData); err != nil {
		_ = os.RemoveAll(pluginDir)
		return nil, "", err
	}

	if err := extractPackageFilesFromZip(zr, pluginDir); err != nil {
		_ = os.RemoveAll(pluginDir)
		return nil, "", err
	}

	for _, f := range zr.File {
		rel := strings.TrimPrefix(filepath.ToSlash(f.Name), "./")
		if rel != "checksums.txt" && filepath.Base(rel) != "checksums.txt" {
			continue
		}
		if err := verifyChecksums(pluginDir, f); err != nil {
			_ = os.RemoveAll(pluginDir)
			return nil, "", err
		}
		break
	}

	if err := ValidateManifestOnDisk(pluginDir, m); err != nil {
		_ = os.RemoveAll(pluginDir)
		return nil, "", err
	}
	return m, pluginDir, nil
}

func readZipEntry(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, fmt.Errorf("open zip entry %q: %w", f.Name, err)
	}
	defer rc.Close()
	data, err := io.ReadAll(io.LimitReader(rc, maxOrbitPackageBytes))
	if err != nil {
		return nil, fmt.Errorf("read zip entry %q: %w", f.Name, err)
	}
	return data, nil
}

func extractZipEntryTo(f *zip.File, dest string) error {
	data, err := readZipEntry(f)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return fmt.Errorf("mkdir %s: %w", filepath.Dir(dest), err)
	}
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", dest, err)
	}
	return nil
}

func verifyChecksums(pluginDir string, checksumsFile *zip.File) error {
	data, err := readZipEntry(checksumsFile)
	if err != nil {
		return err
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fileName, expected, ok := parseChecksumLine(line)
		if !ok {
			continue
		}
		filePath := filepath.Join(pluginDir, fileName)
		raw, err := os.ReadFile(filePath)
		if err != nil {
			return fmt.Errorf("checksum file %q: %w", fileName, err)
		}
		sum := sha256.Sum256(raw)
		actual := hex.EncodeToString(sum[:])
		if actual != expected {
			return fmt.Errorf("checksum mismatch for %q", fileName)
		}
	}
	return nil
}

// extractPackageFilesFromZip writes all package assets except manifest.json and checksums.txt.
func extractPackageFilesFromZip(zr *zip.Reader, pluginDir string) error {
	written := make(map[string]struct{})
	for _, f := range zr.File {
		rel := strings.TrimPrefix(filepath.ToSlash(f.Name), "./")
		if rel == "" || strings.HasSuffix(rel, "/") {
			continue
		}
		if rel == "manifest.json" || rel == "checksums.txt" {
			continue
		}
		if _, ok := written[rel]; ok {
			continue
		}
		dest := filepath.Join(pluginDir, filepath.FromSlash(rel))
		if err := extractZipEntryTo(f, dest); err != nil {
			return err
		}
		written[rel] = struct{}{}
	}
	return nil
}

func parseChecksumLine(line string) (fileName, expected string, ok bool) {
	parts := strings.Fields(line)
	if len(parts) < 2 {
		return "", "", false
	}
	if strings.HasPrefix(strings.ToLower(parts[0]), "sha256:") {
		expected = strings.TrimPrefix(strings.ToLower(parts[0]), "sha256:")
		fileName = parts[len(parts)-1]
		return fileName, expected, true
	}
	if strings.HasPrefix(strings.ToLower(parts[1]), "sha256:") {
		fileName = parts[0]
		expected = strings.TrimPrefix(strings.ToLower(parts[1]), "sha256:")
		return fileName, expected, true
	}
	if len(parts[0]) == 64 {
		expected = strings.ToLower(parts[0])
		fileName = parts[len(parts)-1]
		return fileName, expected, true
	}
	return "", "", false
}
