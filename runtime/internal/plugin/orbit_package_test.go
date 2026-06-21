package plugin

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"github.com/orbit-tauri-tools/runtime/internal/market"
	"github.com/orbit-tauri-tools/runtime/internal/store"
)

// setTestHome isolates UserPluginsDir/store paths. On macOS UserConfigDir uses
// $HOME/Library/Application Support, not XDG_CONFIG_HOME.
func setTestHome(t *testing.T) {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
}

func TestExtractOrbitPackage_Juejin(t *testing.T) {
	root := filepath.Join("..", "..", "..", "docs", "插件", "掘金", "掘金.orbit")
	data, err := os.ReadFile(root)
	if err != nil {
		t.Skipf("sample orbit package missing: %v", err)
	}
	setTestHome(t)

	m, dir, err := extractOrbitPackage(data)
	if err != nil {
		t.Fatalf("extractOrbitPackage: %v", err)
	}
	if m.ID != "juejin" {
		t.Fatalf("expected id juejin, got %q", m.ID)
	}
	if m.Source != SourceWASM {
		t.Fatalf("expected wasm source, got %q", m.Source)
	}
	wasmPath := filepath.Join(dir, "main.wasm.br")
	if _, err := os.Stat(wasmPath); err != nil {
		t.Fatalf("wasm binary missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "manifest.json")); err != nil {
		t.Fatalf("manifest missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, defaultManifestFileName)); err != nil {
		t.Fatalf("default manifest missing: %v", err)
	}
	if m.Meta.LogoImageURL == "" {
		t.Fatal("expected iconUrl alias to populate logoImageUrl")
	}
}

func TestExtractPackageFilesFromZip_ReplacesReadme(t *testing.T) {
	root := filepath.Join("..", "..", "..", "docs", "插件", "联合早报", "联合早报.orbit")
	data, err := os.ReadFile(root)
	if err != nil {
		t.Skipf("sample orbit package missing: %v", err)
	}

	zr, _, _, err := parseOrbitZip(data)
	if err != nil {
		t.Fatalf("parseOrbitZip: %v", err)
	}

	pluginDir := t.TempDir()
	if err := extractPackageFilesFromZip(zr, pluginDir); err != nil {
		t.Fatalf("extractPackageFilesFromZip: %v", err)
	}

	readmePath := filepath.Join(pluginDir, "README.md")
	original, err := os.ReadFile(readmePath)
	if err != nil {
		t.Fatalf("readme missing after extract: %v", err)
	}

	if err := os.WriteFile(readmePath, []byte("stale readme content"), 0o644); err != nil {
		t.Fatalf("write stale readme: %v", err)
	}

	if err := extractPackageFilesFromZip(zr, pluginDir); err != nil {
		t.Fatalf("extractPackageFilesFromZip update: %v", err)
	}

	updated, err := os.ReadFile(readmePath)
	if err != nil {
		t.Fatalf("readme missing after update extract: %v", err)
	}
	if string(updated) != string(original) {
		t.Fatalf("readme was not replaced on update")
	}
}

func TestExtractOrbitPackage_PreservesManifestBytesForChecksum(t *testing.T) {
	manifestRaw := []byte(`{"id":"checksum-test","name":"Checksum Test","version":"1.0.0","mediaType":"article","source":"wasm","capabilities":["feed"],"config":{"channels":[{"id":"all","label":"All","route":"list"}],"refreshInterval":3600,"wasm":{"entry":"plugin.wasm"}},"meta":{"description":"test","icon":"text","color":"bg-blue-500","logoText":"C","logoImageUrl":"","marketCategory":"blog","categoryTag":"Test"}}`)
	wasmRaw := []byte("\x00asm\x01\x00\x00\x00")
	sumManifest := sha256.Sum256(manifestRaw)
	sumWasm := sha256.Sum256(wasmRaw)
	checksums := "sha256:" + hex.EncodeToString(sumManifest[:]) + " manifest.json\n" +
		"sha256:" + hex.EncodeToString(sumWasm[:]) + " plugin.wasm\n"

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, data := range map[string][]byte{
		"manifest.json": manifestRaw,
		"plugin.wasm":   wasmRaw,
		"checksums.txt": []byte(checksums),
	} {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}

	setTestHome(t)

	m, dir, err := extractOrbitPackage(buf.Bytes())
	if err != nil {
		t.Fatalf("extractOrbitPackage: %v", err)
	}
	if m.ID != "checksum-test" {
		t.Fatalf("expected id checksum-test, got %q", m.ID)
	}
	onDisk, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(onDisk, manifestRaw) {
		t.Fatalf("manifest.json bytes were re-serialized")
	}
}

func TestUpdateOrbitPackage_ReplacesManifest(t *testing.T) {
	manifestV1 := []byte(`{"id":"update-test","name":"Update Test","version":"1.0.0","mediaType":"article","source":"wasm","capabilities":["feed"],"config":{"channels":[{"id":"old","label":"Old","route":"list"}],"refreshInterval":999,"wasm":{"entry":"plugin.wasm"}},"meta":{"description":"old","icon":"text","color":"bg-blue-500","logoText":"U","logoImageUrl":"","marketCategory":"blog","categoryTag":"Test"}}`)
	manifestV2 := []byte(`{"id":"update-test","name":"Update Test","version":"2.0.0","mediaType":"article","source":"wasm","capabilities":["feed"],"config":{"channels":[{"id":"new","label":"New","route":"list"}],"refreshInterval":1800,"wasm":{"entry":"plugin.wasm"}},"meta":{"description":"new","icon":"text","color":"bg-blue-500","logoText":"U","logoImageUrl":"","marketCategory":"blog","categoryTag":"Test"}}`)
	wasmRaw := []byte("\x00asm\x01\x00\x00\x00")

	buildPackage := func(manifest []byte) []byte {
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		for name, data := range map[string][]byte{
			"manifest.json": manifest,
			"plugin.wasm":   wasmRaw,
		} {
			w, err := zw.Create(name)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := w.Write(data); err != nil {
				t.Fatal(err)
			}
		}
		if err := zw.Close(); err != nil {
			t.Fatal(err)
		}
		return buf.Bytes()
	}

	setTestHome(t)

	m, dir, err := extractOrbitPackage(buildPackage(manifestV1))
	if err != nil {
		t.Fatalf("extractOrbitPackage: %v", err)
	}
	if m.Version != "1.0.0" {
		t.Fatalf("expected version 1.0.0, got %q", m.Version)
	}

	st, err := store.Open()
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer st.Close()

	reg := NewRegistry(st)
	reg.setRecord(&PluginRecord{
		Manifest:  *m,
		Active:    true,
		SortOrder: 1000,
		Installed: 1,
	})
	reg.setPluginDir(m.ID, dir)

	updated, err := reg.updateOrbitPackage(context.Background(), m.ID, buildPackage(manifestV2))
	if err != nil {
		t.Fatalf("updateOrbitPackage: %v", err)
	}
	if updated.Version != "2.0.0" {
		t.Fatalf("expected version 2.0.0, got %q", updated.Version)
	}
	if updated.Config.RefreshInterval != 1800 {
		t.Fatalf("expected refreshInterval 1800, got %d", updated.Config.RefreshInterval)
	}
	if len(updated.Config.Channels) != 1 || updated.Config.Channels[0].ID != "new" {
		t.Fatalf("expected new channel, got %+v", updated.Config.Channels)
	}
	if updated.Meta.Description != "new" {
		t.Fatalf("expected description new, got %q", updated.Meta.Description)
	}

	onDisk, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(onDisk, manifestV2) {
		t.Fatalf("manifest.json was not replaced with incoming bytes")
	}
	defaultManifest, err := os.ReadFile(filepath.Join(dir, defaultManifestFileName))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(defaultManifest, manifestV2) {
		t.Fatalf("manifest.default.json was not replaced with incoming bytes")
	}
}

func TestApplyMarketPluginMetadata_PersistsContentRating(t *testing.T) {
	manifest := []byte(`{"id":"rating-test","name":"Rating Test","version":"1.0.0","mediaType":"article","source":"wasm","capabilities":["feed"],"config":{"channels":[{"id":"all","label":"All","route":"list"}],"refreshInterval":3600,"wasm":{"entry":"plugin.wasm"}},"meta":{"description":"test","icon":"text","color":"bg-blue-500","logoText":"R","logoImageUrl":"","marketCategory":"blog","categoryTag":"Test"}}`)
	wasmRaw := []byte("\x00asm\x01\x00\x00\x00")

	buildPackage := func() []byte {
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		for name, data := range map[string][]byte{
			"manifest.json": manifest,
			"plugin.wasm":   wasmRaw,
		} {
			w, err := zw.Create(name)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := w.Write(data); err != nil {
				t.Fatal(err)
			}
		}
		if err := zw.Close(); err != nil {
			t.Fatal(err)
		}
		return buf.Bytes()
	}

	setTestHome(t)
	st, err := store.Open()
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer st.Close()

	reg := NewRegistry(st)
	rec, err := reg.InstallOrbit(context.Background(), buildPackage())
	if err != nil {
		t.Fatalf("InstallOrbit: %v", err)
	}
	if rec.ContentRating != "" {
		t.Fatalf("expected empty content rating before market metadata, got %q", rec.ContentRating)
	}

	updated, err := reg.applyMarketPluginMetadata(
		context.Background(),
		rec,
		"market-listing-123",
		ContentRatingMature,
		nil,
	)
	if err != nil {
		t.Fatalf("applyMarketPluginMetadata: %v", err)
	}
	if updated.ContentRating != ContentRatingMature {
		t.Fatalf("expected content rating %q, got %q", ContentRatingMature, updated.ContentRating)
	}
	if updated.Meta.MarketID != "market-listing-123" {
		t.Fatalf("expected market id market-listing-123, got %q", updated.Meta.MarketID)
	}

	rows, err := st.ListPlugins(context.Background())
	if err != nil {
		t.Fatalf("ListPlugins: %v", err)
	}
	var found store.PluginRow
	for _, row := range rows {
		if row.ID == "rating-test" {
			found = row
			break
		}
	}
	if found.ID == "" {
		t.Fatal("plugin row not found in store")
	}
	if found.ContentRating != ContentRatingMature {
		t.Fatalf("expected persisted content rating %q, got %q", ContentRatingMature, found.ContentRating)
	}

	reloaded, ok := reg.Get("rating-test")
	if !ok {
		t.Fatal("plugin not in registry")
	}
	if reloaded.ContentRating != ContentRatingMature {
		t.Fatalf("expected reloaded content rating %q, got %q", ContentRatingMature, reloaded.ContentRating)
	}
}

func TestExtractOrbitPackage_MarketPackage(t *testing.T) {
	if os.Getenv("RUN_MARKET_TEST") == "" {
		t.Skip("set RUN_MARKET_TEST=1 to run")
	}
	setTestHome(t)

	client := market.NewClient()
	data, err := client.DownloadOrbitPackage(context.Background(), "f1570a74")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := extractOrbitPackage(data); err != nil {
		t.Fatalf("extractOrbitPackage: %v", err)
	}
}

func TestLoadWasmBinary_Brotli(t *testing.T) {
	root := filepath.Join("..", "..", "..", "docs", "插件", "掘金", "掘金", "main.wasm.br")
	data, err := loadWasmBinary(root)
	if err != nil {
		t.Fatalf("loadWasmBinary: %v", err)
	}
	if len(data) < 4 || string(data[:4]) != "\x00asm" {
		t.Fatalf("expected wasm magic, got %d bytes", len(data))
	}
}
