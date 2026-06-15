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
)

func TestExtractOrbitPackage_Juejin(t *testing.T) {
	root := filepath.Join("..", "..", "..", "docs", "插件", "掘金", "掘金.orbit")
	data, err := os.ReadFile(root)
	if err != nil {
		t.Skipf("sample orbit package missing: %v", err)
	}
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)

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

	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)

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

func TestExtractOrbitPackage_MarketPackage(t *testing.T) {
	if os.Getenv("RUN_MARKET_TEST") == "" {
		t.Skip("set RUN_MARKET_TEST=1 to run")
	}
	tmp := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", tmp)

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
