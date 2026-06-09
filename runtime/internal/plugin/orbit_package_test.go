package plugin

import (
	"os"
	"path/filepath"
	"testing"
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
